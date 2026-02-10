import { SolanaMessenger } from "./src/index";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=1df52da0-70ca-45fb-8c85-798389b14295";
const KEYPAIR_PATH = join(homedir(), ".config", "solana", "id.json");

async function main() {
  const keypair = new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8")));
  
  const messenger = new SolanaMessenger({ rpcUrl: RPC_URL, keypair });
  await messenger.init();
  
  console.log("Reading messages...");
  const messages = await messenger.read({ limit: 20 });
  
  if (messages.length === 0) {
    console.log("No messages found.");
  } else {
    for (const msg of messages) {
      console.log(`\n[${new Date(msg.timestamp * 1000).toISOString()}] From: ${msg.sender}`);
      console.log(`Text: ${msg.text}`);
      console.log(`Tx: ${msg.txSignatures.join(", ")}`);
    }
  }
}

main().catch(console.error);
