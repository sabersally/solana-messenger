export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export interface DecodedMessage {
  flags: number;
  messageId: Uint8Array;
  chunkIndex: number;
  totalChunks: number;
  payload: Uint8Array;
}

export interface MessageSentEvent {
  sender: string;
  recipient: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
  txSignature?: string;
}

export interface Message {
  sender: string;
  recipient: string;
  text: string;
  timestamp: number;
  messageId: Uint8Array;
  txSignatures: string[];
}
