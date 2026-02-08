declare module "ed2curve" {
  export function convertPublicKey(pk: Uint8Array): Uint8Array | null;
  export function convertSecretKey(sk: Uint8Array): Uint8Array;
}
