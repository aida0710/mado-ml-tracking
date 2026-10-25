import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

/**
 * Where the next page starts. The default creation order uses a keyset (the last Run of the
 * previous page) so Runs created while a user pages through the history do not shift later pages.
 * Any other order has no stable unique key in SQL, so it falls back to an absolute offset.
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
 * Identifies the search conditions a cursor belongs to. The page size is excluded because
 * changing it does not move the start of the next page in either mode.
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
