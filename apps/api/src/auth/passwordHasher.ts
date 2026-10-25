import argon2 from 'argon2';

// 長さはUTF-8のバイト数で数える。日本語は1文字3バイトで、Argon2が制限するのはバイト数のため。
export const PASSWORD_MIN_BYTES = 12;
// 攻撃者が1回のハッシュ計算に負わせられる仕事量を抑える。
export const PASSWORD_MAX_BYTES = 1024;

// ローカルアカウントはこのインターフェースだけに依存させ、アルゴリズム（たとえばscrypt）を
// 差し替えられるようにする。
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  // 形式の壊れたハッシュや別方式のハッシュには、例外を投げずにfalseを返す。
  verify(passwordHash: string, password: string): Promise<boolean>;
  needsRehash(passwordHash: string): boolean;
}

export function isAcceptablePasswordLength(password: string): boolean {
  const bytes = Buffer.byteLength(password, 'utf8');
  return bytes >= PASSWORD_MIN_BYTES && bytes <= PASSWORD_MAX_BYTES;
}

// OWASP Password Storage Cheat SheetにあるArgon2idの最低値。符号化したハッシュは設定値と
// saltを含むので、あとでこの値を上げても古いハッシュを検証できる。
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const argon2idPasswordHasher: PasswordHasher = {
  async hash(password) {
    if (!isAcceptablePasswordLength(password))
      throw new Error(`Password must be ${PASSWORD_MIN_BYTES}-${PASSWORD_MAX_BYTES} bytes`);
    return argon2.hash(password, ARGON2ID_OPTIONS);
  },
  async verify(passwordHash, password) {
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return false;
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  },
  needsRehash(passwordHash) {
    try {
      return argon2.needsRehash(passwordHash, ARGON2ID_OPTIONS);
    } catch {
      return true;
    }
  },
};
