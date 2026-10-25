import { createHash } from 'node:crypto';
import {
  compileSearchExpression,
  type CompiledSearch,
  type SearchEntity,
} from '../../domain/runSearch/runSearchCompiler.js';
import type { TrackingSearch } from './trackingTypes.js';
import { invalidParameter } from './trackingValidation.js';

export type { CompiledSearch } from '../../domain/runSearch/runSearchCompiler.js';

// MLflowのリクエストのフィールドはsnake_caseで、共通のコンパイラはドメインの式を受け取る。
export function compileSearch(
  entity: SearchEntity,
  search: TrackingSearch,
  parameters: unknown[],
): CompiledSearch {
  return compileSearchExpression(
    entity,
    { filter: search.filter, orderBy: search.order_by },
    parameters,
  );
}

function searchFingerprint(search: unknown): string {
  return createHash('sha256').update(JSON.stringify(search)).digest('hex');
}
export function pageOffset(pageToken: string | undefined, search: unknown): number {
  if (!pageToken) return 0;
  try {
    const page = JSON.parse(Buffer.from(pageToken, 'base64url').toString('utf8')) as {
      offset: number;
      query: string;
    };
    if (
      !Number.isSafeInteger(page.offset) ||
      page.offset < 0 ||
      page.query !== searchFingerprint(search)
    )
      invalidParameter('page_token does not match the search conditions');
    return page.offset;
  } catch {
    invalidParameter('invalid page_token');
  }
}
export function nextPageToken(offset: number, search: unknown): string {
  return Buffer.from(JSON.stringify({ offset, query: searchFingerprint(search) })).toString(
    'base64url',
  );
}
