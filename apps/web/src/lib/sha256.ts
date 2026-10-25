// 素のJavaScriptで書いたSHA-256（FIPS 180-4）。Web Cryptoは安全なコンテキストにしか無く、素の
// httpで開いたLANのサーバーはそれに当たらないが、アップロードの再開ではやはりpartを比べる
// 必要がある。

const BLOCK_BYTES = 64;
const WORD_BYTES = 4;
// ブロックを16個のビッグエンディアンの語として読み、メッセージスケジュールの先頭にする。
const BLOCK_WORDS = BLOCK_BYTES / WORD_BYTES;
const SCHEDULE_WORDS = 64;
const BITS_PER_BYTE = 8;
// メッセージの長さは、0x80の目印のバイトの後に64ビットのビッグエンディアンのビット数で足す。
const LENGTH_FIELD_BYTES = 8;
const MARKER_BYTE = 0x80;
const TWO_TO_32 = 2 ** 32;

/** 最初の64個の素数の立方根の小数部の、先頭32ビット。 */
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** 最初の8個の素数の平方根の小数部の、先頭32ビット。 */
const INITIAL_HASH = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotateRight = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));

/**
 * 途中のハッシュ値と、各ブロックを展開するメッセージスケジュール。スケジュールのバッファはどの
 * ブロックでも使い回し、大きなpartをハッシュしてもブロックごとの割り当てが起きないようにする。
 */
interface HashState {
  hash: Uint32Array;
  schedule: Uint32Array;
}

/** 小文字の16進のダイジェスト。APIが受け取ったpartごとに保存するのと同じ形。 */
export function computeSha256Hex(bytes: Uint8Array): string {
  const hasher = createSha256();
  hasher.update(bytes);
  return hasher.digestHex();
}

/** 少しずつ与えるダイジェスト。メモリより大きなファイルも1切れずつハッシュできる。 */
export interface Sha256Hasher {
  update(bytes: Uint8Array): void;
  /** メッセージを終える。その後はこのhasherを使わない。 */
  digestHex(): string;
}

export function createSha256(): Sha256Hasher {
  const state: HashState = {
    hash: Uint32Array.from(INITIAL_HASH),
    schedule: new Uint32Array(SCHEDULE_WORDS),
  };
  // 未完成のブロックのバイト列。次のupdateで埋まるまで持っておく。
  const pending = new Uint8Array(BLOCK_BYTES);
  const pendingView = new DataView(pending.buffer);
  let pendingLength = 0;
  let messageLength = 0;
  return {
    update(bytes) {
      messageLength += bytes.length;
      let offset = 0;
      if (pendingLength > 0) {
        offset = Math.min(BLOCK_BYTES - pendingLength, bytes.length);
        pending.set(bytes.subarray(0, offset), pendingLength);
        pendingLength += offset;
        if (pendingLength < BLOCK_BYTES) return;
        compressBlock(state, pendingView, 0);
        pendingLength = 0;
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const fullBlocksEnd = offset + Math.floor((bytes.length - offset) / BLOCK_BYTES) * BLOCK_BYTES;
      for (; offset < fullBlocksEnd; offset += BLOCK_BYTES) compressBlock(state, view, offset);
      pending.set(bytes.subarray(offset));
      pendingLength = bytes.length - offset;
    },
    digestHex() {
      const tailBytes = pendingLength + 1 + LENGTH_FIELD_BYTES <= BLOCK_BYTES ? BLOCK_BYTES : 2 * BLOCK_BYTES;
      const tail = new Uint8Array(tailBytes);
      tail.set(pending.subarray(0, pendingLength));
      tail[pendingLength] = MARKER_BYTE;
      const tailView = new DataView(tail.buffer);
      const bitLength = messageLength * BITS_PER_BYTE;
      tailView.setUint32(tailBytes - LENGTH_FIELD_BYTES, Math.floor(bitLength / TWO_TO_32));
      tailView.setUint32(tailBytes - WORD_BYTES, bitLength >>> 0);
      for (let offset = 0; offset < tailBytes; offset += BLOCK_BYTES) compressBlock(state, tailView, offset);
      return Array.from(state.hash, (word) => word.toString(16).padStart(8, '0')).join('');
    },
  };
}

/** `view`の`offset`にあるブロックを、途中のハッシュ値に畳み込む。 */
function compressBlock({ hash, schedule }: HashState, view: DataView, offset: number) {
  for (let index = 0; index < BLOCK_WORDS; index += 1) schedule[index] = view.getUint32(offset + index * WORD_BYTES);
  // 後ろの語はそれぞれ、16、15、7、2個前の語を混ぜる（FIPS 180-4、6.2.2のstep 1）。
  for (let index = BLOCK_WORDS; index < SCHEDULE_WORDS; index += 1) {
    const before15 = schedule[index - 15]!;
    const before2 = schedule[index - 2]!;
    const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
    const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
    schedule[index] = schedule[index - 16]! + sigma0 + schedule[index - 7]! + sigma1;
  }
  let a = hash[0]!;
  let b = hash[1]!;
  let c = hash[2]!;
  let d = hash[3]!;
  let e = hash[4]!;
  let f = hash[5]!;
  let g = hash[6]!;
  let h = hash[7]!;
  for (let index = 0; index < SCHEDULE_WORDS; index += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);
    const temporary1 = (h + sum1 + choice + ROUND_CONSTANTS[index]! + schedule[index]!) | 0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temporary2 = (sum0 + majority) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + temporary1) | 0;
    d = c;
    c = b;
    b = a;
    a = (temporary1 + temporary2) | 0;
  }
  hash[0] = hash[0]! + a;
  hash[1] = hash[1]! + b;
  hash[2] = hash[2]! + c;
  hash[3] = hash[3]! + d;
  hash[4] = hash[4]! + e;
  hash[5] = hash[5]! + f;
  hash[6] = hash[6]! + g;
  hash[7] = hash[7]! + h;
}
