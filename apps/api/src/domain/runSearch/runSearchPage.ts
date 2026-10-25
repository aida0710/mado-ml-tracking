import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

/**
 * 次のページの始まり。既定の作成順ではkeyset（前のページの最後のRun）を使い、利用者が履歴を
 * めくっている間に作られたRunで後ろのページがずれないようにする。ほかの並び順にはSQLで安定した
 * 一意のキーが無いので、絶対的なoffsetに戻る。
 */
export type RunSearchCursor =
  { mode: 'keyset'; afterRunId: string } | { mode: 'offset'; offset: number };

interface EncodedCursor {
  mode: RunSearchCursor['mode'];
  afterRunId?: string;
  offset?: number;
  conditions: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidCursor(message: string): never {
  throw new DomainError({ status: 400, code: 'invalid_cursor', message });
}

/**
 * cursorがどの検索条件のものかを表す。ページの大きさは含めない。大きさを変えても、どちらの
 * モードでも次のページの始まりは動かないため。
 */
export function runSearchConditionsFingerprint(conditions: unknown): string {
  return createHash('sha256').update(JSON.stringify(conditions)).digest('hex');
}

export function encodeRunSearchCursor(cursor: RunSearchCursor, fingerprint: string): string {
  const encoded: EncodedCursor = { ...cursor, conditions: fingerprint };
  return Buffer.from(JSON.stringify(encoded)).toString('base64url');
}

export function decodeRunSearchCursor(
  token: string,
  expected: { fingerprint: string; mode: RunSearchCursor['mode'] },
): RunSearchCursor {
  let cursor: EncodedCursor;
  try {
    cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as EncodedCursor;
  } catch {
    invalidCursor('invalid cursor');
  }
  if (typeof cursor !== 'object' || cursor === null) invalidCursor('invalid cursor');
  if (cursor.conditions !== expected.fingerprint || cursor.mode !== expected.mode)
    invalidCursor('the cursor does not match the search conditions; search again from the first page');
  if (cursor.mode === 'keyset') {
    if (typeof cursor.afterRunId !== 'string' || !UUID_PATTERN.test(cursor.afterRunId))
      invalidCursor('invalid cursor');
    return { mode: 'keyset', afterRunId: cursor.afterRunId };
  }
  if (!Number.isSafeInteger(cursor.offset) || cursor.offset! < 0) invalidCursor('invalid cursor');
  return { mode: 'offset', offset: cursor.offset! };
}
