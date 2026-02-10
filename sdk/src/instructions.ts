import { address, AccountRole } from "@solana/kit";
import { addressToBytes } from "./utils";

const SEND_MESSAGE_DISC = new Uint8Array([57, 40, 34, 178, 189, 10, 65, 26]);
const REGISTER_DISC = new Uint8Array([211, 124, 67, 15, 211, 194, 178, 240]);
const UPDATE_ENCRYPTION_KEY_DISC = new Uint8Array([92, 233, 29, 101, 152, 97, 110, 235]);
const DEREGISTER_DISC = new Uint8Array([161, 178, 39, 189, 231, 224, 13, 187]);
const SET_MIN_FEE_DISC = new Uint8Array([114, 198, 35, 3, 41, 196, 194, 246]);
const INITIALIZE_CONFIG_DISC = new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70]);
const UPDATE_CONFIG_DISC = new Uint8Array([29, 158, 252, 191, 10, 83, 219, 99]);

const DEFAULT_PROGRAM_ID = "msg1jhfewu1hGDnQKGhXDmqas6JZTq7Lg7PbSX5jY9y";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

function serializeSendMessageData(
  recipientPubkey: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const len = 8 + 32 + 4 + ciphertext.length + 24;
  const buf = new Uint8Array(len);
  let offset = 0;

  buf.set(SEND_MESSAGE_DISC, offset);
  offset += 8;
  buf.set(recipientPubkey, offset);
  offset += 32;

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(offset, ciphertext.length, true);
  offset += 4;
  buf.set(ciphertext, offset);
  offset += ciphertext.length;
  buf.set(nonce, offset);

  return buf;
}

export function buildSendMessageInstruction(params: {
  sender: string;
  recipient: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  configPda: string;
  feeVault: string;
  recipientRegistryPda: string;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const recipientBytes = addressToBytes(params.recipient);
  const data = serializeSendMessageData(recipientBytes, params.ciphertext, params.nonce);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.sender), role: AccountRole.WRITABLE_SIGNER },
      { address: address(params.configPda), role: AccountRole.READONLY },
      { address: address(params.feeVault), role: AccountRole.WRITABLE },
      { address: address(params.recipientRegistryPda), role: AccountRole.READONLY },
      { address: address(params.recipient), role: AccountRole.WRITABLE },
      { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
    ],
    data,
  };
}

export function buildRegisterInstruction(params: {
  owner: string;
  encryptionPubkey: Uint8Array;
  registryPda: string;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const data = new Uint8Array(40);
  data.set(REGISTER_DISC, 0);
  data.set(params.encryptionPubkey, 8);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.registryPda), role: AccountRole.WRITABLE },
      { address: address(params.owner), role: AccountRole.WRITABLE_SIGNER },
      { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
    ],
    data,
  };
}

export function buildUpdateEncryptionKeyInstruction(params: {
  owner: string;
  newEncryptionPubkey: Uint8Array;
  registryPda: string;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const data = new Uint8Array(40);
  data.set(UPDATE_ENCRYPTION_KEY_DISC, 0);
  data.set(params.newEncryptionPubkey, 8);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.registryPda), role: AccountRole.WRITABLE },
      { address: address(params.owner), role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

export function buildSetMinFeeInstruction(params: {
  owner: string;
  registryPda: string;
  minFee: bigint;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const data = new Uint8Array(16);
  data.set(SET_MIN_FEE_DISC, 0);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, params.minFee, true);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.registryPda), role: AccountRole.WRITABLE },
      { address: address(params.owner), role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

export function buildInitializeConfigInstruction(params: {
  authority: string;
  configPda: string;
  feeVault: string;
  protocolFee: bigint;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const data = new Uint8Array(48);
  data.set(INITIALIZE_CONFIG_DISC, 0);
  data.set(addressToBytes(params.feeVault), 8);
  const view = new DataView(data.buffer);
  view.setBigUint64(40, params.protocolFee, true);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.configPda), role: AccountRole.WRITABLE },
      { address: address(params.authority), role: AccountRole.WRITABLE_SIGNER },
      { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
    ],
    data,
  };
}

export function buildUpdateConfigInstruction(params: {
  authority: string;
  configPda: string;
  feeVault?: string;
  protocolFee?: bigint;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  // Borsh Option<Pubkey> = 1 byte tag + 32 bytes, Option<u64> = 1 byte tag + 8 bytes
  const data = new Uint8Array(8 + 33 + 9);
  data.set(UPDATE_CONFIG_DISC, 0);
  if (params.feeVault) {
    data[8] = 1; // Some
    data.set(addressToBytes(params.feeVault), 9);
  }
  // else data[8] = 0 (None, already zeroed)
  if (params.protocolFee !== undefined) {
    data[41] = 1; // Some
    const view = new DataView(data.buffer);
    view.setBigUint64(42, params.protocolFee, true);
  }

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.configPda), role: AccountRole.WRITABLE },
      { address: address(params.authority), role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

export function buildDeregisterInstruction(params: {
  owner: string;
  registryPda: string;
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const data = new Uint8Array(8);
  data.set(DEREGISTER_DISC, 0);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.registryPda), role: AccountRole.WRITABLE },
      { address: address(params.owner), role: AccountRole.WRITABLE_SIGNER },
    ],
    data,
  };
}
