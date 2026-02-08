import { createSolanaRpc, getBase58Decoder, address } from "@solana/kit";
import { deriveRegistryPda } from "./pda";

export async function lookupEncryptionKey(
  rpc: ReturnType<typeof createSolanaRpc>,
  walletAddress: string,
  programId?: string,
): Promise<string | null> {
  const registryPda = await deriveRegistryPda(walletAddress, programId);

  try {
    const result = await rpc
      .getAccountInfo(address(registryPda), { encoding: "base64" })
      .send();
    if (!result.value?.data) return null;

    const raw =
      typeof result.value.data === "string"
        ? Uint8Array.from(Buffer.from(result.value.data, "base64"))
        : Uint8Array.from(Buffer.from((result.value.data as any)[0], "base64"));

    // Skip 8 byte discriminator + 32 byte owner = offset 40 for encryption_key (32 bytes)
    const encryptionKeyBytes = raw.subarray(40, 72);
    const decoder = getBase58Decoder();
    return decoder.decode(encryptionKeyBytes);
  } catch {
    return null;
  }
}
