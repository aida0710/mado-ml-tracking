// PostgreSQL's SQLSTATE (40001, 57P01) or a Node system error code (ECONNRESET): fixed tokens that
// never carry the query or its values.
const ERROR_CODE_PATTERN = /^[0-9A-Z_]{1,40}$/;
// A class name is an identifier; a name made from data is not logged.
const ERROR_NAME_PATTERN = /^[A-Za-z0-9_.]{1,100}$/;

/**
 * What a log may say about an unexpected error: its class name and code, never its message, which
 * can hold SQL text and the values in it. A DomainError's own code (lowercase) is not an error
 * code here; logs give it separately.
 */
export function errorClue(error: unknown): { errorName: string; errorCode: string | null } {
  const errorName =
    error instanceof Error && ERROR_NAME_PATTERN.test(error.name) ? error.name : 'Error';
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return {
    errorName,
    errorCode: typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : null,
  };
}
