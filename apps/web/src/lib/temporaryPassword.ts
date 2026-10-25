// APIのpasswordHasherは12〜1024バイト（UTF-8）を受け付ける。ここで最小値を確かめると、送信後の
// 422ではなく、その場でメッセージを出せる。
const PASSWORD_MIN_BYTES = 12;
// ランダムな18バイトはbase64urlで24文字になり、APIがリセットで作るパスワードと同じ長さになる。
const GENERATED_PASSWORD_BYTES = 18;

/** 管理者が一度だけ渡せる、ランダムな初期パスワード。 */
export function generateTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_PASSWORD_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function isLongEnoughPassword(password: string): boolean {
  return new TextEncoder().encode(password).length >= PASSWORD_MIN_BYTES;
}
