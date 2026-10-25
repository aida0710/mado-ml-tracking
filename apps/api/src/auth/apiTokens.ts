import { hashSecret, randomSecret } from './secrets.js';

// 個人・Service Account・launcher の API token の前置き。前置きで製品と種類が分かるよう、
// mado S3 Data Catalog の mado_dc_ とそろえる。Job token の前置きは mado_mtj_（jobTokens.ts）。
export const API_TOKEN_PREFIX = 'mado_mt_';
// 一覧で token を見分けるために、前置きのあとの乱数を8文字だけ残す。残りを推測できない短さにとどめる。
const STORED_PREFIX_RANDOM_CHARACTERS = 8;
export const STORED_TOKEN_PREFIX_LENGTH = API_TOKEN_PREFIX.length + STORED_PREFIX_RANDOM_CHARACTERS;

export interface ApiTokenSecret {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

/** 新しい API token の値と、DB に残す照合値と先頭を作る。値は発行した応答で一度だけ返す。 */
export function createApiTokenSecret(): ApiTokenSecret {
  const token = `${API_TOKEN_PREFIX}${randomSecret()}`;
  return {
    token,
    tokenHash: hashSecret(token),
    tokenPrefix: token.slice(0, STORED_TOKEN_PREFIX_LENGTH),
  };
}
