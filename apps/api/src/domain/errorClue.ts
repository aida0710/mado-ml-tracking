// PostgreSQLのSQLSTATE（40001、57P01）か、Nodeのシステムエラーのコード（ECONNRESET）。
// 決まった文字列で、クエリやその値を含まない。
const ERROR_CODE_PATTERN = /^[0-9A-Z_]{1,40}$/;
// クラス名は識別子。データから作られた名前はログに出さない。
const ERROR_NAME_PATTERN = /^[A-Za-z0-9_.]{1,100}$/;

/**
 * 想定外のエラーについてログに書いてよいこと。クラス名とコードだけで、メッセージは書かない
 * （SQLの文とその値が入りうる）。DomainError自身のコード（小文字）はここではエラーコードとして
 * 扱わず、ログには別に出す。
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
