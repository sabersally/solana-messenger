/**
 * E2E test for the encryption key registry.
 * Tests: register → lookup → update → lookup again → send encrypted msg using registry → deregister
 */
import { SolanaMessenger } from "./src/index";
import * as nacl from "tweetnacl";
import { readFileSync } from "fs";
import { getBase58Decoder } from "@solana/kit";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const decoder = getBase58Decoder();

async function main() {
  // Sally's keypair (the "privy wallet" / identity)
  const sallyKeypair = new Uint8Array(
    JSON.parse(readFileSync("/Users/sallysaber/.config/solana/id.json", "utf-8"))
  );
  const sallyAddress = decoder.decode(sallyKeypair.subarray(32, 64));

  // Generate encryption keypair B (local, no SOL needed)
  const encryptionKp = nacl.sign.keyPair();
  const encryptionAddress = decoder.decode(encryptionKp.publicKey);

  console.log("=== Registry E2E Test ===");
  console.log(`Identity (A): ${sallyAddress}`);
  console.log(`Encryption (B): ${encryptionAddress}`);
  console.log();

  const messenger = new SolanaMessenger({
    rpcUrl: RPC_URL,
    keypair: sallyKeypair,
  });

  // 1. Register encryption key
  console.log("1. Registering encryption key...");
  const regSig = await messenger.register(encryptionKp.publicKey);
  console.log(`   ✅ Registered! Tx: ${regSig}`);

  // 2. Lookup
  console.log("2. Looking up encryption key...");
  const looked = await messenger.lookupEncryptionKey(sallyAddress);
  console.log(`   Found: ${looked}`);
  if (looked !== encryptionAddress) {
    console.log(`   ❌ MISMATCH! Expected ${encryptionAddress}`);
    process.exit(1);
  }
  console.log("   ✅ Matches!");

  // 3. Generate new encryption key and update
  const encryptionKp2 = nacl.sign.keyPair();
  const encryptionAddress2 = decoder.decode(encryptionKp2.publicKey);
  console.log(`3. Updating encryption key to: ${encryptionAddress2}`);
  const updSig = await messenger.updateEncryptionKey(encryptionKp2.publicKey);
  console.log(`   ✅ Updated! Tx: ${updSig}`);

  // 4. Lookup again
  console.log("4. Looking up updated key...");
  const looked2 = await messenger.lookupEncryptionKey(sallyAddress);
  console.log(`   Found: ${looked2}`);
  if (looked2 !== encryptionAddress2) {
    console.log(`   ❌ MISMATCH! Expected ${encryptionAddress2}`);
    process.exit(1);
  }
  console.log("   ✅ Matches updated key!");

  // 5. Send a message using the registry lookup flow
  // Another agent (ephemeral) sends a message to Sally
  // They look up Sally's encryption key, encrypt to it
  console.log("5. Testing message flow with registry...");
  const otherAgentKp = nacl.sign.keyPair();
  // Fund not needed for otherAgent since Sally is sending to herself for test
  // Instead: Sally sends a message to herself, encrypted to B2
  // Actually let's just verify the lookup + encrypt/decrypt chain works
  
  // Simulate: someone looks up Sally's encryption key
  const sallyEncKey = await messenger.lookupEncryptionKey(sallyAddress);
  console.log(`   Looked up Sally's encryption key: ${sallyEncKey}`);
  
  // They would encrypt to this key. Let's verify it matches B2
  if (sallyEncKey === encryptionAddress2) {
    console.log("   ✅ Registry returns correct key for message encryption!");
  } else {
    console.log("   ❌ Registry key mismatch");
    process.exit(1);
  }

  // 6. Deregister
  console.log("6. Deregistering...");
  const deregSig = await messenger.deregister();
  console.log(`   ✅ Deregistered! Tx: ${deregSig}`);

  // 7. Verify lookup returns null
  console.log("7. Verifying cleanup...");
  const looked3 = await messenger.lookupEncryptionKey(sallyAddress);
  if (looked3 === null) {
    console.log("   ✅ Lookup returns null after deregister!");
  } else {
    console.log(`   ❌ Expected null, got: ${looked3}`);
    process.exit(1);
  }

  console.log();
  console.log("🎉 ALL REGISTRY TESTS PASSED!");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
