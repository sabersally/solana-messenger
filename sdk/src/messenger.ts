import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  createKeyPairSignerFromBytes,
} from "@solana/kit";
import type { KeyPairSigner } from "@solana/kit";
import { encrypt, decryptRaw, encodeMessage, decodeMessage } from "./crypto";
import { parseMessageSentEvents } from "./events";
import { Message, MessageSentEvent } from "./types";
import { addressToBytes, hexEncode } from "./utils";
import {
  buildSendMessageInstruction,
  buildRegisterInstruction,
  buildUpdateEncryptionKeyInstruction,
  buildDeregisterInstruction,
} from "./instructions";
import { deriveRegistryPda } from "./pda";
import { lookupEncryptionKey } from "./registry";
import { loadOrGenerateEncryptionKeypair } from "./keys";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_PROGRAM_ID = "msg1jhfewu1hGDnQKGhXDmqas6JZTq7Lg7PbSX5jY9y";

/**
 * External signer function — receives a serialized unsigned transaction,
 * returns a serialized signed transaction ready to broadcast.
 */
export type ExternalSignerFn = (
  unsignedTx: Uint8Array,
  recentBlockhash: string,
  feePayer: string,
) => Promise<Uint8Array>;

/**
 * Mode 1: Self-custody — pass raw keypair, SDK signs internally.
 */
export interface SelfCustodyConfig {
  rpcUrl: string;
  keypair: Uint8Array; // 64-byte ed25519 keypair
  programId?: string;
  wsUrl?: string;
  keysDir?: string;
}

/**
 * Mode 2: External signer — pass wallet address + signer callback (Privy, Turnkey, etc).
 */
export interface ExternalSignerConfig {
  rpcUrl: string;
  walletAddress: string;
  signer: ExternalSignerFn;
  programId?: string;
  wsUrl?: string;
  keysDir?: string;
}

export type SolanaMessengerConfig = SelfCustodyConfig | ExternalSignerConfig;

function isSelfCustody(config: SolanaMessengerConfig): config is SelfCustodyConfig {
  return "keypair" in config;
}

export class SolanaMessenger {
  private rpc: ReturnType<typeof createSolanaRpc>;
  private rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions> | null = null;
  private programId: string;
  private rpcUrl: string;
  private wsUrl: string | undefined;
  private keysDir: string;
  private encryptionKeypair: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  private initialized = false;

  // Self-custody mode
  private signerPromise: Promise<KeyPairSigner> | null = null;
  private keypairBytes: Uint8Array | null = null;

  // External signer mode
  private externalSigner: ExternalSignerFn | null = null;
  private _walletAddress: string | null = null;

  constructor(config: SolanaMessengerConfig) {
    this.rpcUrl = config.rpcUrl;
    this.wsUrl = config.wsUrl;
    this.rpc = createSolanaRpc(config.rpcUrl as any);
    this.programId = config.programId ?? DEFAULT_PROGRAM_ID;
    this.keysDir = config.keysDir ?? join(homedir(), ".solana-messenger", "keys");

    if (isSelfCustody(config)) {
      this.keypairBytes = config.keypair;
      this.signerPromise = createKeyPairSignerFromBytes(config.keypair);
    } else {
      this._walletAddress = config.walletAddress;
      this.externalSigner = config.signer;
    }
  }

  async init(): Promise<{ encryptionAddress: string; registered: boolean }> {
    const myAddress = await this.getAddress();
    const { getBase58Decoder } = await import("@solana/kit");
    const decoder = getBase58Decoder();

    const result = loadOrGenerateEncryptionKeypair(myAddress, this.keysDir);
    this.encryptionKeypair = { publicKey: result.publicKey, secretKey: result.secretKey };
    const encryptionAddress = decoder.decode(this.encryptionKeypair.publicKey);

    const onChainKey = await lookupEncryptionKey(this.rpc, myAddress, this.programId);
    let registered = false;

    if (onChainKey === encryptionAddress) {
      registered = false;
    } else if (onChainKey === null) {
      await this.register(this.encryptionKeypair.publicKey);
      registered = true;
    } else {
      await this.updateEncryptionKey(this.encryptionKeypair.publicKey);
      registered = true;
    }

    this.initialized = true;
    return { encryptionAddress, registered };
  }

  getEncryptionSecretKey(): Uint8Array {
    if (!this.encryptionKeypair) throw new Error("Not initialized. Call init() first.");
    return this.encryptionKeypair.secretKey;
  }

  getEncryptionPublicKey(): Uint8Array {
    if (!this.encryptionKeypair) throw new Error("Not initialized. Call init() first.");
    return this.encryptionKeypair.publicKey;
  }

  async getAddress(): Promise<string> {
    if (this._walletAddress) return this._walletAddress;
    const signer = await this.signerPromise!;
    return signer.address;
  }

  private isExternalSigner(): boolean {
    return this.externalSigner !== null;
  }

  async send(recipient: string, message: string, encryptionPubkey?: Uint8Array): Promise<string[]> {
    const myAddress = await this.getAddress();
    const chunks = encodeMessage(message);

    let encryptToBytes: Uint8Array;
    if (encryptionPubkey) {
      encryptToBytes = encryptionPubkey;
    } else if (this.initialized) {
      const lookedUp = await lookupEncryptionKey(this.rpc, recipient, this.programId);
      encryptToBytes = lookedUp ? addressToBytes(lookedUp) : addressToBytes(recipient);
    } else {
      encryptToBytes = addressToBytes(recipient);
    }

    // For encryption: use identity key (self-custody) or encryption keypair (external signer)
    const encryptionSecretKey = this.keypairBytes ?? this.encryptionKeypair?.secretKey;
    if (!encryptionSecretKey) {
      throw new Error("No encryption key available. Call init() first when using external signer mode.");
    }

    const signatures: string[] = [];

    for (const chunk of chunks) {
      const { ciphertext, nonce } = encrypt(chunk, encryptionSecretKey, encryptToBytes);
      const ix = buildSendMessageInstruction({
        sender: myAddress,
        recipient,
        ciphertext,
        nonce,
        programId: this.programId,
      });

      // Attach signer for self-custody mode
      if (this.signerPromise) {
        const signer = await this.signerPromise;
        ix.accounts[0] = { ...ix.accounts[0], signer };
      }

      const sig = await this.sendInstruction(ix);
      signatures.push(sig);
    }

    return signatures;
  }

  async read(options?: { since?: number; limit?: number }): Promise<Message[]> {
    const myAddress = await this.getAddress();
    const limit = options?.limit ?? 100;
    const since = options?.since ?? 0;
    const programAddr = address(this.programId);

    let allSignatures: Array<{ signature: string; blockTime?: number | null }> = [];
    let before: string | undefined;
    const batchSize = 1000;

    while (allSignatures.length < limit * 10) {
      const result = await this.rpc
        .getSignaturesForAddress(programAddr, {
          before: before as any,
          limit: batchSize,
        })
        .send();

      if (result.length === 0) break;
      for (const s of result) {
        allSignatures.push({
          signature: s.signature,
          blockTime: s.blockTime != null ? Number(s.blockTime) : null,
        });
      }
      before = result[result.length - 1].signature;
      if (result.length < batchSize) break;
    }

    if (since > 0) {
      allSignatures = allSignatures.filter((s) => s.blockTime && s.blockTime >= since);
    }

    const messages: MessageSentEvent[] = [];

    for (let i = 0; i < allSignatures.length; i += 20) {
      const batch = allSignatures.slice(i, i + 20);
      for (let j = 0; j < batch.length; j++) {
        const tx = await this.rpc
          .getTransaction(batch[j].signature as any, {
            encoding: "json" as const,
            maxSupportedTransactionVersion: 0,
          })
          .send();

        if (!tx?.meta?.logMessages) continue;
        const events = parseMessageSentEvents(tx.meta.logMessages as string[]);
        for (const event of events) {
          if (event.recipient === myAddress) {
            event.txSignature = batch[j].signature;
            messages.push(event);
          }
        }
        if (messages.length >= limit) break;
      }
      if (messages.length >= limit) break;
    }

    return this.reassembleMessages(messages.slice(0, limit));
  }

  async listen(callback: (msg: Message) => void): Promise<() => void> {
    const myAddress = await this.getAddress();
    const programAddr = address(this.programId);
    const subscriptions = this.getSubscriptions();

    const chunkBuffer = new Map<string, { events: MessageSentEvent[]; totalChunks: number }>();
    let aborted = false;
    const abortController = new AbortController();

    const processLogs = async () => {
      const subscription = await subscriptions
        .logsNotifications({ mentions: [programAddr] }, { commitment: "confirmed" })
        .subscribe({ abortSignal: abortController.signal });

      for await (const notification of subscription) {
        if (aborted) break;
        const logInfo = notification.value;
        if (logInfo.err) continue;

        const logs = logInfo.logs as string[];
        const events = parseMessageSentEvents(logs);

        for (const event of events) {
          if (event.recipient !== myAddress) continue;
          event.txSignature = notification.value.signature;

          try {
            const rawFrame = this.decryptToBytes(event);
            if (!rawFrame) continue;
            const decoded = decodeMessage(rawFrame);
            const msgIdHex = hexEncode(decoded.messageId);

            if (decoded.totalChunks === 1) {
              callback({
                sender: event.sender,
                recipient: event.recipient,
                text: new TextDecoder().decode(decoded.payload),
                timestamp: event.timestamp,
                messageId: decoded.messageId,
                txSignatures: [event.txSignature || ""],
              });
            } else {
              if (!chunkBuffer.has(msgIdHex)) {
                chunkBuffer.set(msgIdHex, { events: [], totalChunks: decoded.totalChunks });
              }
              const buf = chunkBuffer.get(msgIdHex)!;
              buf.events.push(event);
              if (buf.events.length === buf.totalChunks) {
                const assembled = this.assembleChunks(buf.events);
                if (assembled) callback(assembled);
                chunkBuffer.delete(msgIdHex);
              }
            }
          } catch {
            // Ignore
          }
        }
      }
    };

    processLogs().catch(() => {});
    return () => {
      aborted = true;
      abortController.abort();
    };
  }

  async register(encryptionPubkey: Uint8Array): Promise<string> {
    const myAddress = await this.getAddress();
    const registryPda = await deriveRegistryPda(myAddress, this.programId);

    const ix = buildRegisterInstruction({
      owner: myAddress,
      encryptionPubkey,
      registryPda,
      programId: this.programId,
    });
    if (this.signerPromise) {
      const signer = await this.signerPromise;
      ix.accounts[1] = { ...ix.accounts[1], signer };
    }

    return this.sendInstruction(ix);
  }

  async updateEncryptionKey(newEncryptionPubkey: Uint8Array): Promise<string> {
    const myAddress = await this.getAddress();
    const registryPda = await deriveRegistryPda(myAddress, this.programId);

    const ix = buildUpdateEncryptionKeyInstruction({
      owner: myAddress,
      newEncryptionPubkey,
      registryPda,
      programId: this.programId,
    });
    if (this.signerPromise) {
      const signer = await this.signerPromise;
      ix.accounts[1] = { ...ix.accounts[1], signer };
    }

    return this.sendInstruction(ix);
  }

  async deregister(): Promise<string> {
    const myAddress = await this.getAddress();
    const registryPda = await deriveRegistryPda(myAddress, this.programId);

    const ix = buildDeregisterInstruction({
      owner: myAddress,
      registryPda,
      programId: this.programId,
    });
    if (this.signerPromise) {
      const signer = await this.signerPromise;
      ix.accounts[1] = { ...ix.accounts[1], signer };
    }

    return this.sendInstruction(ix);
  }

  async lookupEncryptionKey(walletAddress: string): Promise<string | null> {
    return lookupEncryptionKey(this.rpc, walletAddress, this.programId);
  }

  private async sendInstruction(instruction: any): Promise<string> {
    const myAddress = await this.getAddress();
    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send();

    if (this.isExternalSigner()) {
      // External signer mode: build unsigned tx, pass to signer
      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(address(myAddress), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m) => appendTransactionMessageInstruction(instruction, m),
      );

      const { compileTransaction, getTransactionEncoder, getTransactionDecoder } = await import("@solana/kit");
      const compiledTx = compileTransaction(txMessage);
      const unsignedBytes = new Uint8Array(getTransactionEncoder().encode(compiledTx));

      const signedBytes = await this.externalSigner!(
        unsignedBytes,
        latestBlockhash.blockhash,
        myAddress,
      );

      const signedTx = getTransactionDecoder().decode(signedBytes);
      const sig = getSignatureFromTransaction(signedTx);

      const b64 = Buffer.from(signedBytes).toString("base64");
      await this.rpc.sendTransaction(b64 as any, { encoding: "base64" as any }).send();

      // Poll for confirmation
      for (let i = 0; i < 30; i++) {
        const statuses = await this.rpc.getSignatureStatuses([sig as any]).send();
        const status = statuses.value[0]?.confirmationStatus;
        if (status === "confirmed" || status === "finalized") return sig;
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error(`Transaction ${sig} not confirmed after 30s`);
    } else {
      // Self-custody mode: sign internally
      const signer = await this.signerPromise!;
      const sendAndConfirm = sendAndConfirmTransactionFactory({
        rpc: this.rpc as any,
        rpcSubscriptions: this.getSubscriptions() as any,
      });

      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(signer.address, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m) => appendTransactionMessageInstruction(instruction, m),
      );

      const signedTx = await signTransactionMessageWithSigners(txMessage);
      const sig = getSignatureFromTransaction(signedTx);
      await sendAndConfirm(signedTx as any, { commitment: "confirmed" });
      return sig;
    }
  }

  private getSubscriptions(): ReturnType<typeof createSolanaRpcSubscriptions> {
    if (!this.rpcSubscriptions) {
      const wsUrl = this.wsUrl ?? this.rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
      this.rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl as any);
    }
    return this.rpcSubscriptions;
  }

  private decryptToBytes(event: MessageSentEvent): Uint8Array | null {
    const senderPubkeyBytes = addressToBytes(event.sender);
    if (this.encryptionKeypair) {
      const result = decryptRaw(event.ciphertext, event.nonce, senderPubkeyBytes, this.encryptionKeypair.secretKey);
      if (result) return result;
    }
    if (this.keypairBytes) {
      return decryptRaw(event.ciphertext, event.nonce, senderPubkeyBytes, this.keypairBytes);
    }
    return null;
  }

  private reassembleMessages(events: MessageSentEvent[]): Message[] {
    const chunkGroups = new Map<
      string,
      { decoded: ReturnType<typeof decodeMessage>; event: MessageSentEvent }[]
    >();
    const standaloneMessages: Message[] = [];

    for (const event of events) {
      const raw = this.decryptToBytes(event);
      if (!raw) continue;

      try {
        const decoded = decodeMessage(raw);
        const msgIdHex = hexEncode(decoded.messageId);

        if (decoded.totalChunks === 1) {
          standaloneMessages.push({
            sender: event.sender,
            recipient: event.recipient,
            text: new TextDecoder().decode(decoded.payload),
            timestamp: event.timestamp,
            messageId: decoded.messageId,
            txSignatures: [event.txSignature || ""],
          });
        } else {
          if (!chunkGroups.has(msgIdHex)) chunkGroups.set(msgIdHex, []);
          chunkGroups.get(msgIdHex)!.push({ decoded, event });
        }
      } catch {
        // Skip
      }
    }

    for (const [, chunks] of chunkGroups) {
      chunks.sort((a, b) => a.decoded.chunkIndex - b.decoded.chunkIndex);
      if (chunks.length !== chunks[0].decoded.totalChunks) continue;

      const payloads = chunks.map((c) => c.decoded.payload);
      const totalLen = payloads.reduce((acc, p) => acc + p.length, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of payloads) {
        combined.set(p, offset);
        offset += p.length;
      }

      standaloneMessages.push({
        sender: chunks[0].event.sender,
        recipient: chunks[0].event.recipient,
        text: new TextDecoder().decode(combined),
        timestamp: chunks[0].event.timestamp,
        messageId: chunks[0].decoded.messageId,
        txSignatures: chunks.map((c) => c.event.txSignature || ""),
      });
    }

    return standaloneMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  private assembleChunks(events: MessageSentEvent[]): Message | null {
    const decoded = events
      .map((e) => {
        const raw = this.decryptToBytes(e);
        if (!raw) return null;
        return { decoded: decodeMessage(raw), event: e };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (decoded.length === 0) return null;

    decoded.sort((a, b) => a.decoded.chunkIndex - b.decoded.chunkIndex);
    const payloads = decoded.map((d) => d.decoded.payload);
    const totalLen = payloads.reduce((acc, p) => acc + p.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of payloads) {
      combined.set(p, offset);
      offset += p.length;
    }

    return {
      sender: decoded[0].event.sender,
      recipient: decoded[0].event.recipient,
      text: new TextDecoder().decode(combined),
      timestamp: decoded[0].event.timestamp,
      messageId: decoded[0].decoded.messageId,
      txSignatures: decoded.map((d) => d.event.txSignature || ""),
    };
  }
}
