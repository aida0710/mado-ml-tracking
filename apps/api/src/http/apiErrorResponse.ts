import type { ApiErrorBody } from '@mmt/contracts';
import { ArtifactRangeError } from '@mmt/platform';
import { DomainError } from '../domain/errors.js';

/**
 * 独自 API のエラー応答の本文 `{ error, code, ...details }`。独自 API の応答はすべてここを通し、手で
 * `{ error }` を書かない（apps/api/test/api-error-responses.test.ts が確かめる）。
 */
export function apiErrorBody(error: DomainError): ApiErrorBody {
  return { ...error.details, error: error.message, code: error.code };
}

// PostgreSQL の SQLSTATE。一意制約・外部キー・CHECK 制約の違反は、入力で起こる失敗として答える。
const UNIQUE_VIOLATION = '23505';
const REFERENCE_VIOLATIONS = new Set(['23503', '23514']);

/**
 * route の外から上がった失敗を、応答にできる DomainError にする。想定外の失敗は名前と SQLSTATE だけを
 * ログに書く（SQL や連携先の例外の文には秘密の値が入りうる）。
 */
export function asDomainError(error: Error): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof ArtifactRangeError)
    return new DomainError({
      status: 416,
      code: 'range_not_satisfiable',
      message: 'the requested range is not satisfiable',
    });
  const databaseCode = (error as { code?: string }).code;
  if (databaseCode === UNIQUE_VIOLATION)
    return new DomainError({
      status: 409,
      code: 'already_exists',
      message: 'the same name or version is already registered',
    });
  if (databaseCode !== undefined && REFERENCE_VIOLATIONS.has(databaseCode))
    return new DomainError({
      status: 422,
      code: 'invalid_reference',
      message: 'the request violates a reference or an immutable version',
    });
  console.error(
    JSON.stringify({
      event: 'api_request_failed',
      name: error.name,
      code: databaseCode ?? 'internal_error',
    }),
  );
  return new DomainError({
    status: 503,
    code: 'internal_error',
    message: 'failed to process the request',
  });
}
