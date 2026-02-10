import { SolanaMessenger } from "./src/index";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const RPC_URL = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=1df52da0-70ca-45fb-8c85-798389b14295";
const KEYPAIR_PATH = join(homedir(), ".config", "solana", "id.json");

async function main() {
  const keypair = new Uint8Array(JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8")));
  
  const messenger = new SolanaMessenger({
    rpcUrl: RPC_URL,
    keypair,
  });

  console.log("Initializing...");
  const { encryptionAddress, status } = await messenger.init();
  const myAddress = await messenger.getAddress();
  
  console.log(`Wallet: ${myAddress}`);
  console.log(`Encryption key: ${encryptionAddress}`);
  console.log(`Status: ${status}`);
  console.log("Listening for messages...");

  await messenger.listen((msg) => {
    console.log(`\n[${new Date(msg.timestamp * 1000).toISOString()}] ${msg.sender}:`);
    console.log(msg.text);
  });
}

main().catch(console.error);
