import { address, getProgramDerivedAddress } from "@solana/kit";
import { addressToBytes } from "./utils";

const DEFAULT_PROGRAM_ID = "msg1jhfewu1hGDnQKGhXDmqas6JZTq7Lg7PbSX5jY9y";

export async function deriveRegistryPda(
  walletAddress: string,
  programId?: string,
): Promise<string> {
  const walletBytes = addressToBytes(walletAddress);
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(programId ?? DEFAULT_PROGRAM_ID),
    seeds: [new TextEncoder().encode("messenger"), walletBytes],
  });
  return pda as string;
}
