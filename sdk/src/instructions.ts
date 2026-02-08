import { address, AccountRole } from "@solana/kit";
import { addressToBytes } from "./utils";

const SEND_MESSAGE_DISC = new Uint8Array([57, 40, 34, 178, 189, 10, 65, 26]);
const REGISTER_DISC = new Uint8Array([211, 124, 67, 15, 211, 194, 178, 240]);
const UPDATE_ENCRYPTION_KEY_DISC = new Uint8Array([92, 233, 29, 101, 152, 97, 110, 235]);
const DEREGISTER_DISC = new Uint8Array([161, 178, 39, 189, 231, 224, 13, 187]);

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
  programId?: string;
}): { programAddress: ReturnType<typeof address>; accounts: any[]; data: Uint8Array } {
  const programId = params.programId ?? DEFAULT_PROGRAM_ID;
  const recipientBytes = addressToBytes(params.recipient);
  const data = serializeSendMessageData(recipientBytes, params.ciphertext, params.nonce);

  return {
    programAddress: address(programId),
    accounts: [
      { address: address(params.sender), role: AccountRole.WRITABLE_SIGNER },
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
