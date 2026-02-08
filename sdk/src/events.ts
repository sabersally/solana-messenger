import { getBase58Decoder } from "@solana/kit";
import { MessageSentEvent } from "./types";

const MESSAGE_SENT_DISCRIMINATOR = new Uint8Array([116, 70, 224, 76, 128, 28, 110, 55]);

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

function readI64LE(data: Uint8Array, offset: number): number {
  // Read as two u32s and combine (safe for timestamps)
  const lo = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | ((data[offset + 3] << 24) >>> 0);
  const hi = data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | ((data[offset + 7] << 24) >>> 0);
  return lo + hi * 0x100000000;
}

function base64Decode(str: string): Uint8Array {
  // Works in both Node.js and browser
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js Buffer fallback
  return new Uint8Array(Buffer.from(str, "base64"));
}

function pubkeyBytesToAddress(bytes: Uint8Array): string {
  const decoder = getBase58Decoder();
  return decoder.decode(bytes);
}

export function parseMessageSentEvents(logs: string[]): MessageSentEvent[] {
  const events: MessageSentEvent[] = [];
  const prefix = "Program data: ";

  for (const line of logs) {
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;

    const b64 = line.slice(idx + prefix.length).trim();
    let data: Uint8Array;
    try {
      data = base64Decode(b64);
    } catch {
      continue;
    }

    if (data.length < 8) continue;
    if (!bytesEqual(data.subarray(0, 8), MESSAGE_SENT_DISCRIMINATOR)) continue;

    let offset = 8;
    // sender: 32 bytes
    const senderBytes = data.subarray(offset, offset + 32);
    offset += 32;
    // recipient: 32 bytes
    const recipientBytes = data.subarray(offset, offset + 32);
    offset += 32;
    // ciphertext: 4-byte LE length + data
    const ctLen = readU32LE(data, offset);
    offset += 4;
    const ciphertext = data.subarray(offset, offset + ctLen);
    offset += ctLen;
    // nonce: 24 bytes
    const nonce = data.subarray(offset, offset + 24);
    offset += 24;
    // timestamp: i64 LE
    const timestamp = readI64LE(data, offset);

    events.push({
      sender: pubkeyBytesToAddress(senderBytes),
      recipient: pubkeyBytesToAddress(recipientBytes),
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      timestamp,
    });
  }

  return events;
}
