import { SolanaMessenger } from "./src/index";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=1df52da0-70ca-45fb-8c85-798389b14295";
const KEYPAIR_PATH = join(homedir(), ".config", "solana", "id.json");

async function main() {
  const recipient = process.argv[2];
  const message = process.argv[3];
  if (!recipient || !message) {
    console.error("Usage: npx tsx send-message.ts <recipient> <message>");
    process.exit(1);
  }

  const keypair = new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8")));
  const messenger = new SolanaMessenger({ rpcUrl: RPC_URL, keypair });
  await messenger.init();

  console.log(`Sending to ${recipient}...`);
  const sigs = await messenger.send(recipient, message);
  console.log(`Sent! Tx: ${sigs.join(", ")}`);
}

main().catch(console.error);
