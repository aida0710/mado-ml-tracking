import { createHash } from 'node:crypto';
import { MAX_MODEL_PAGE_SIZE } from './limits.js';
import { invalidParameter } from './validation.js';

/** One page of a model search: where it starts, how many rows it serves, and its query. */
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
    /* Invalid input is translated to the same public validation error. */
  }
  return invalidParameter('page_token does not match the search conditions');
}

/**
 * The page a search request asks for. `query` must not contain max_results: like MLflow's offset
 * tokens, a token stays valid when the next request asks for a different page size, which
 * mlflow.search_model_versions() does when it fetches the remainder of max_results.
 * A max_results above MAX_MODEL_PAGE_SIZE is served one page at a time with next_page_token
 * instead of being rejected, so SDK defaults such as search_model_versions' 10000 work.
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
 * Cuts rows fetched with LIMIT size+1 down to the page. The extra row only tells that a next page
 * exists; `continuation` is spread into the response as MLflow's next_page_token.
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
