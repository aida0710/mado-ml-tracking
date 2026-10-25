import { createHash } from 'node:crypto';
import { MAX_MODEL_PAGE_SIZE } from './limits.js';
import { invalidParameter } from './validation.js';

/** モデルの検索の1ページ。どこから始まり、何行を返し、どのクエリのものか。 */
export interface SearchPage {
  offset: number;
  size: number;
  fingerprint: string;
}

function searchFingerprint(query: unknown): string {
  return createHash('sha256').update(JSON.stringify(query)).digest('hex');
}

function pageOffset(token: string | undefined, fingerprint: string): number {
  if (!token) return 0;
  try {
    const page = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      offset?: unknown;
      fingerprint?: unknown;
    };
    if (
      typeof page.offset === 'number' &&
      Number.isSafeInteger(page.offset) &&
      page.offset >= 0 &&
      page.fingerprint === fingerprint
    )
      return page.offset;
  } catch {
    /* 不正な入力は、同じ公開の検証エラーに変換する。 */
  }
  return invalidParameter('page_token does not match the search conditions');
}

/**
 * 検索のリクエストが求めるページ。`query`にmax_resultsを含めてはならない。MLflowのoffsetの
 * tokenと同じく、次のリクエストが別のページの大きさを求めてもtokenを有効なままにするため。
 * mlflow.search_model_versions()は、max_resultsの残りを取るときにそうする。
 * MAX_MODEL_PAGE_SIZEを超えるmax_resultsは拒まず、next_page_tokenで1ページずつ返すので、
 * search_model_versionsの10000のようなSDKの既定値も動く。
 */
export function requestedPage(request: {
  query: unknown;
  pageToken: string | undefined;
  maxResults: number;
}): SearchPage {
  const fingerprint = searchFingerprint(request.query);
  return {
    offset: pageOffset(request.pageToken, fingerprint),
    size: Math.min(request.maxResults, MAX_MODEL_PAGE_SIZE),
    fingerprint,
  };
}

/**
 * LIMIT size+1で取った行をページの大きさに切る。余分な1行は次のページがあることを示すだけ。
 * `continuation`はMLflowのnext_page_tokenとして応答に展開する。
 */
export function cutPage<T>(
  rows: T[],
  page: SearchPage,
): { items: T[]; continuation: { next_page_token?: string } } {
  if (rows.length <= page.size) return { items: rows, continuation: {} };
  const nextPageToken = Buffer.from(
    JSON.stringify({ offset: page.offset + page.size, fingerprint: page.fingerprint }),
  ).toString('base64url');
  return { items: rows.slice(0, page.size), continuation: { next_page_token: nextPageToken } };
}
