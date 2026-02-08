import { getBase58Encoder } from "@solana/kit";

export function addressToBytes(addr: string): Uint8Array {
  const encoder = getBase58Encoder();
  return new Uint8Array(encoder.encode(addr));
}

export function hexEncode(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
