// Instruction builders (core — use these for custom signing)
export {
  buildSendMessageInstruction,
  buildRegisterInstruction,
  buildUpdateEncryptionKeyInstruction,
  buildDeregisterInstruction,
  buildSetMinFeeInstruction,
  buildInitializeConfigInstruction,
  buildUpdateConfigInstruction,
} from "./instructions";

// PDA
export { deriveRegistryPda, deriveConfigPda } from "./pda";

// Registry lookup
export { lookupEncryptionKey } from "./registry";

// Key management
export { loadOrGenerateEncryptionKeypair } from "./keys";

// Crypto
export {
  convertEd25519ToX25519,
  encrypt,
  decrypt,
  decryptRaw,
  encodeMessage,
  decodeMessage,
} from "./crypto";

// Events
export { parseMessageSentEvents } from "./events";

// Types
export type {
  EncryptedPayload,
  DecodedMessage,
  MessageSentEvent,
  Message,
} from "./types";

// Convenience class
export { SolanaMessenger } from "./messenger";
export type {
  SolanaMessengerConfig,
  SelfCustodyConfig,
  ExternalSignerConfig,
  ExternalSignerFn,
} from "./messenger";
