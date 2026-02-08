import nacl from "tweetnacl";
import ed2curve from "ed2curve";
import { EncryptedPayload, DecodedMessage } from "./types";

const HEADER_SIZE = 13; // 1 (flags) + 8 (message_id) + 2 (chunk_index) + 2 (total_chunks)
const MAX_PAYLOAD_SIZE = 661; // 900 - overhead for encryption + header
const FLAGS_STANDALONE = 0x00;
const FLAGS_CHUNKED = 0x01;

export function convertEd25519ToX25519(
  ed25519PublicKey: Uint8Array,
  ed25519SecretKey: Uint8Array
): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const x25519Public = ed2curve.convertPublicKey(ed25519PublicKey);
  const x25519Secret = ed2curve.convertSecretKey(ed25519SecretKey);
  if (!x25519Public) {
    throw new Error("Failed to convert ed25519 public key to x25519");
  }
  return { publicKey: x25519Public, secretKey: x25519Secret };
}

export function encrypt(
  message: Uint8Array,
  senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array
): EncryptedPayload {
  const senderX = ed2curve.convertSecretKey(senderSecretKey);
  const recipientX = ed2curve.convertPublicKey(recipientPublicKey);
  if (!recipientX) {
    throw new Error("Failed to convert recipient public key to x25519");
  }
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(message, nonce, recipientX, senderX);
  return { ciphertext, nonce };
}

export function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string {
  const senderX = ed2curve.convertPublicKey(senderPublicKey);
  const recipientX = ed2curve.convertSecretKey(recipientSecretKey);
  if (!senderX) {
    throw new Error("Failed to convert sender public key to x25519");
  }
  const plaintext = nacl.box.open(ciphertext, nonce, senderX, recipientX);
  if (!plaintext) {
    throw new Error("Decryption failed — invalid ciphertext or wrong keys");
  }
  return new TextDecoder().decode(plaintext);
}

export function decryptRaw(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array | null {
  const senderX = ed2curve.convertPublicKey(senderPublicKey);
  const recipientX = ed2curve.convertSecretKey(recipientSecretKey);
  if (!senderX) return null;
  return nacl.box.open(ciphertext, nonce, senderX, recipientX) || null;
}

function randomMessageId(): Uint8Array {
  return nacl.randomBytes(8);
}

function writeU16BE(buf: Uint8Array, value: number, offset: number): void {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

export function encodeMessage(text: string): Uint8Array[] {
  const payload = new TextEncoder().encode(text);
  const messageId = randomMessageId();

  if (payload.length <= MAX_PAYLOAD_SIZE) {
    const frame = new Uint8Array(HEADER_SIZE + payload.length);
    frame[0] = FLAGS_STANDALONE;
    frame.set(messageId, 1);
    writeU16BE(frame, 0, 9);
    writeU16BE(frame, 1, 11);
    frame.set(payload, HEADER_SIZE);
    return [frame];
  }

  const chunks: Uint8Array[] = [];
  const totalChunks = Math.ceil(payload.length / MAX_PAYLOAD_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * MAX_PAYLOAD_SIZE;
    const end = Math.min(start + MAX_PAYLOAD_SIZE, payload.length);
    const chunkPayload = payload.slice(start, end);
    const frame = new Uint8Array(HEADER_SIZE + chunkPayload.length);
    frame[0] = FLAGS_CHUNKED;
    frame.set(messageId, 1);
    writeU16BE(frame, i, 9);
    writeU16BE(frame, totalChunks, 11);
    frame.set(chunkPayload, HEADER_SIZE);
    chunks.push(frame);
  }
  return chunks;
}

export function decodeMessage(data: Uint8Array): DecodedMessage {
  if (data.length < HEADER_SIZE) {
    throw new Error(`Message too short: ${data.length} bytes, need at least ${HEADER_SIZE}`);
  }
  return {
    flags: data[0],
    messageId: data.slice(1, 9),
    chunkIndex: readU16BE(data, 9),
    totalChunks: readU16BE(data, 11),
    payload: data.slice(HEADER_SIZE),
  };
}
