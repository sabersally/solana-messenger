/**
 * End-to-end test: send an encrypted message on devnet, then read it back.
 * Uses two keypairs (sender = Sally's wallet, receiver = ephemeral).
 */
import { SolanaMessenger } from "./src/index";
import * as nacl from "tweetnacl";
import { readFileSync } from "fs";
import { getBase58Decoder } from "@solana/kit";

const RPC_URL = "https://api.devnet.solana.com";

async function main() {
  // Load Sally's keypair (sender)
  const senderKeypairBytes = new Uint8Array(
    JSON.parse(readFileSync("/Users/sallysaber/.config/solana/id.json", "utf-8"))
  );

  // Generate ephemeral receiver keypair
  const receiverKp = nacl.sign.keyPair();

  const decoder = getBase58Decoder();
  const senderAddress = decoder.decode(senderKeypairBytes.subarray(32, 64));
  const receiverAddress = decoder.decode(receiverKp.publicKey);

  console.log("=== Solana Messenger E2E Test (v0.2.0 — @solana/kit) ===");
  console.log(`Sender:   ${senderAddress}`);
  console.log(`Receiver: ${receiverAddress}`);
  console.log();

  // Init messenger as sender
  const sender = new SolanaMessenger({
    rpcUrl: RPC_URL,
    keypair: senderKeypairBytes,
  });

  // Send a message
  const testMsg = `gm from sally! testing solana-messenger v0.2.0 (pure @solana/kit) 😈⚡ ${Date.now()}`;
  console.log(`Sending: "${testMsg}"`);
  console.log("...");

  const sigs = await sender.send(receiverAddress, testMsg);
  console.log(`✅ Sent! Tx: ${sigs[0]}`);
  console.log();

  // Now read as receiver
  console.log("Reading messages as receiver...");
  const receiver = new SolanaMessenger({
    rpcUrl: RPC_URL,
    keypair: new Uint8Array([...receiverKp.secretKey]),
  });

  const messages = await receiver.read({ limit: 10 });
  console.log(`Found ${messages.length} message(s)`);

  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    console.log();
    console.log("--- Decrypted Message ---");
    console.log(`From:      ${last.sender}`);
    console.log(`Text:      ${last.text}`);
    console.log(`Timestamp: ${new Date(last.timestamp * 1000).toISOString()}`);
    console.log(`Tx:        ${last.txSignatures[0]}`);

    if (last.text === testMsg) {
      console.log();
      console.log("🎉 TEST PASSED — message sent, received, and decrypted correctly!");
    } else {
      console.log();
      console.log("❌ TEST FAILED — decrypted text doesn't match!");
      console.log(`Expected: ${testMsg}`);
      console.log(`Got:      ${last.text}`);
      process.exit(1);
    }
  } else {
    console.log("❌ TEST FAILED — no messages found");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
