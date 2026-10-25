import { errorClue } from './errorClue.js';
import { DomainError } from './errors.js';

/**
 * 1つのステップの起動が続けて失敗できる回数。これを超えると実行が失敗する。下の待ち時間と
 * 合わせて、データベースやイメージレジストリの5分程度の停止なら、実行を終わらせずにやり過ごせる。
 */
export const WORKFLOW_STEP_LAUNCH_MAX_FAILURES = 10;
/** 起動に失敗したあと、スケジューラはこの時間だけステップを置いてから起動し直す。 */
export const WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS = 30;

// 起動し直しても同じく断られるもの（4xx）。所有者がアクセスを失った、ワークフローがアーカイブ
// された、など。5xxの断りは、イメージレジストリに届かないなど、サービスが応答しなかったことを表す。
function isLastingRefusal(error: unknown): error is DomainError {
  return error instanceof DomainError && error.status < 500;
}

/**
 * 失敗した起動が、もう一度試せば成功しうるかどうか。恒久的な断り以外のすべて（データベースの
 * 接続が切れた、イメージレジストリに届かない）が当たる。恒久的な断りはステップをすぐに失敗にする。
 */
export function isTemporaryLaunchFailure(error: unknown): boolean {
  return !isLastingRefusal(error);
}

/** 失敗したステップとその実行が、それらを終わらせた起動について利用者に示す内容。 */
export function launchFailureMessage(failure: { error: unknown; failures: number }): string {
  const { error, failures } = failure;
  if (isLastingRefusal(error)) return error.message;
  const lastReason =
    error instanceof DomainError ? error.message : internalErrorDescription(error);
  return `ステップの起動が${failures}回続けて失敗したため、実行を止めました。最後の理由: ${lastReason}`;
}

// 想定外のエラーのメッセージはSQLの文を含みうるので、利用者にはその名前とコードだけを見せる。
// APIのログ（workflow_step_launch_failed）にも、実行とステップとともに同じものを出す。
function internalErrorDescription(error: unknown): string {
  const { errorName, errorCode } = errorClue(error);
  return `APIの内部エラー（${[errorName, errorCode].filter(Boolean).join(' ')}）`;
}
