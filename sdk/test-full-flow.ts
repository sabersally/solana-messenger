/**
 * Full agent-to-agent messaging flow with registry:
 * 
 * 1. Agent A (Sally) calls init() → generates encryption key B, registers on-chain
 * 2. Agent A sends a message to itself (self-test with registry-routed encryption)
 * 3. Agent A reads and decrypts using B's secret key
 * 4. Idempotency test: init() again doesn't re-register
 * 5. Cleanup: deregister
 * 
 * Note: A proper two-agent test requires two funded wallets. This test validates
 * the full init→register→send→read→deregister flow with a single agent.
 */
import { SolanaMessenger } from "./src/index";
import { readFileSync, rmSync } from "fs";
import { getBase58Decoder } from "@solana/kit";
import { join } from "path";
import { tmpdir } from "os";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const decoder = getBase58Decoder();

async function main() {
  const testKeysDir = join(tmpdir(), `solana-messenger-test-${Date.now()}`);

  const agentKeypair = new Uint8Array(
    JSON.parse(readFileSync("/Users/sallysaber/.config/solana/id.json", "utf-8"))
  );
  const agentAddress = decoder.decode(agentKeypair.subarray(32, 64));

  console.log("=== Full Agent Flow Test (with Registry) ===");
  console.log(`Agent: ${agentAddress}`);
  console.log(`Keys dir: ${testKeysDir}`);
  console.log();

  const agent = new SolanaMessenger({
    rpcUrl: RPC_URL,
    keypair: agentKeypair,
    keysDir: testKeysDir,
  });

  // 1. Init — generates encryption key B, registers on-chain
  console.log("1. Calling init()...");
  const initResult = await agent.init();
  console.log(`   Encryption key (B): ${initResult.encryptionAddress}`);
  console.log(`   Registered on-chain: ${initResult.registered}`);
  console.log("   ✅ Initialized!");
  console.log();

  // 2. Verify registry
  console.log("2. Verifying registry lookup...");
  const lookedUp = await agent.lookupEncryptionKey(agentAddress);
  if (lookedUp !== initResult.encryptionAddress) {
    console.log(`   ❌ Mismatch! Expected ${initResult.encryptionAddress}, got ${lookedUp}`);
    process.exit(1);
  }
  console.log(`   ✅ Registry returns correct key: ${lookedUp}`);
  console.log();

  // 3. Send message to self (encrypted via registry-looked-up key B)
  const testMsg = `registry-routed message 🔐⚡ ${Date.now()}`;
  console.log(`3. Sending: "${testMsg}"`);
  const sigs = await agent.send(agentAddress, testMsg);
  console.log(`   ✅ Sent! Tx: ${sigs[0]}`);
  console.log();

  // 4. Read and decrypt
  console.log("4. Reading messages...");
  await new Promise(r => setTimeout(r, 2000));
  const messages = await agent.read({ limit: 10 });
  console.log(`   Found ${messages.length} message(s)`);

  const found = messages.find(m => m.text === testMsg);
  if (found) {
    console.log(`   Text: ${found.text}`);
    console.log("   ✅ Decrypted correctly!");
  } else {
    console.log("   ❌ Message not found!");
    messages.forEach((m, i) => console.log(`   [${i}] ${m.text.substring(0, 60)}`));
    process.exit(1);
  }
  console.log();

  // 5. Idempotency: init() again should NOT re-register
  console.log("5. Calling init() again (idempotency)...");
  const initResult2 = await agent.init();
  if (initResult2.registered) {
    console.log("   ❌ Re-registered when it shouldn't have!");
    process.exit(1);
  }
  console.log("   ✅ No re-registration needed!");
  console.log();

  // 6. Cleanup
  console.log("6. Deregistering...");
  await agent.deregister();
  const afterDeregister = await agent.lookupEncryptionKey(agentAddress);
  if (afterDeregister !== null) {
    console.log(`   ❌ Expected null, got ${afterDeregister}`);
    process.exit(1);
  }
  console.log("   ✅ Deregistered, lookup returns null!");

  rmSync(testKeysDir, { recursive: true, force: true });

  console.log();
  console.log("🎉 ALL TESTS PASSED!");
  console.log();
  console.log("Flow validated: init() → register → lookupEncryptionKey → send (registry-routed) → read (decrypt with B) → deregister");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
