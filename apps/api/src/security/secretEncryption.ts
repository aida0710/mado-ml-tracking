import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * サーバーが読み戻す必要のある秘密（保存先の認証情報、SSOのsessionが持つOIDCのtoken、連携の
 * access token、webhookの秘密）のためのAES-256-GCM。用途ごとに別の鍵を渡す。こうすると、
 * 漏れた鍵や切り替えた鍵で影響を受けるのはその種類の秘密だけになり、ある種類の行を別の種類
 * として復号することもできない。
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
// 96ビットのnonceはGCMの標準の長さ。暗号化のたびに新しい乱数で作る。
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
// payloadの形式のバージョン。あとで形式を変えても、今書いた行を読めるようにする。
const FORMAT_VERSION = 1;
// 鍵について何も明かさずに鍵を見分けられるだけの、鍵のSHA-256の先頭部分。
const KEY_ID_HEX_LENGTH = 16;

export interface SecretKey {
  /** 鍵が変わったことをはっきり伝えるため、暗号文ごとに並べて保存するフィンガープリント。 */
  id: string;
  material: Buffer;
}
export interface EncryptedSecret {
  keyId: string;
  /** バージョン（1バイト）+ nonce + 暗号文 + tag。 */
  payload: Buffer;
}

export class SecretKeyFormatError extends Error {
  constructor() {
    super('Secret key must be base64 of exactly 32 bytes');
    this.name = 'SecretKeyFormatError';
  }
}
/** 暗号文が別の鍵で暗号化されている（鍵を切り替える前のものなど）。 */
export class SecretKeyMismatchError extends Error {
  constructor() {
    super('Secret was encrypted with a different key');
    this.name = 'SecretKeyMismatchError';
  }
}
/** payloadかそのcontextが改変された、またはpayloadが既知の形式でない。 */
export class SecretDecryptionError extends Error {
  constructor() {
    super('Secret could not be decrypted');
    this.name = 'SecretDecryptionError';
  }
}

export function parseSecretKey(base64: string): SecretKey {
  const material = Buffer.from(base64, 'base64');
  // Buffer.fromは不正な文字を無視するので、往復して一致すれば正しいbase64だったと確かめられる。
  if (material.length !== KEY_BYTES || material.toString('base64') !== base64.trim())
    throw new SecretKeyFormatError();
  const id = createHash('sha256').update(material).digest('hex').slice(0, KEY_ID_HEX_LENGTH);
  return { id, material };
}

/**
 * context（"storage-backend:<name>"など）は認証の対象にするが保存はしない。そのため、別の行へ
 * 写した暗号文はそこでは復号できない。
 */
function additionalData(keyId: string, context: string): Buffer {
  return Buffer.from(JSON.stringify([FORMAT_VERSION, keyId, context]));
}

export function encryptSecret({
  key,
  plaintext,
  context,
}: {
  key: SecretKey;
  plaintext: string;
  context: string;
}): EncryptedSecret {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.material, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(key.id, context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    keyId: key.id,
    payload: Buffer.concat([Buffer.from([FORMAT_VERSION]), nonce, ciphertext, cipher.getAuthTag()]),
  };
}

export function decryptSecret({
  key,
  encrypted,
  context,
}: {
  key: SecretKey;
  encrypted: EncryptedSecret;
  context: string;
}): string {
  if (encrypted.keyId !== key.id) throw new SecretKeyMismatchError();
  const { payload } = encrypted;
  if (payload.length < 1 + NONCE_BYTES + TAG_BYTES || payload[0] !== FORMAT_VERSION)
    throw new SecretDecryptionError();
  const nonce = payload.subarray(1, 1 + NONCE_BYTES);
  const ciphertext = payload.subarray(1 + NONCE_BYTES, payload.length - TAG_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv(ALGORITHM, key.material, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(additionalData(key.id, context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretDecryptionError();
  }
}
