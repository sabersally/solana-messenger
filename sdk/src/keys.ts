import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import nacl from "tweetnacl";

const DEFAULT_KEYS_DIR = join(homedir(), ".solana-messenger", "keys");

export function loadOrGenerateEncryptionKeypair(
  walletAddress: string,
  keysDir?: string,
): { publicKey: Uint8Array; secretKey: Uint8Array; path: string; generated: boolean } {
  const dir = keysDir ?? DEFAULT_KEYS_DIR;
  const keyPath = join(dir, `${walletAddress}.json`);

  if (existsSync(keyPath)) {
    const raw = JSON.parse(readFileSync(keyPath, "utf-8"));
    return {
      publicKey: new Uint8Array(raw.publicKey),
      secretKey: new Uint8Array(raw.secretKey),
      path: keyPath,
      generated: false,
    };
  }

  const kp = nacl.sign.keyPair();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    keyPath,
    JSON.stringify({
      publicKey: Array.from(kp.publicKey),
      secretKey: Array.from(kp.secretKey),
    }),
  );

  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    path: keyPath,
    generated: true,
  };
}
