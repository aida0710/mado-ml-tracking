import { errorClue } from './errorClue.js';
import { DomainError } from './errors.js';

/**
 * Failed launches of one step, in a row, before its execution fails. With the wait below, an
 * outage of the database or an image registry of about five minutes passes without ending it.
 */
export const WORKFLOW_STEP_LAUNCH_MAX_FAILURES = 10;
/** After a failed launch the scheduler leaves the step this long before launching it again. */
export const WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS = 30;

// A refusal that launching again would get again (4xx): the owner lost access, the workflow was
// archived. A 5xx refusal says a service did not answer, such as an unreachable image registry.
function isLastingRefusal(error: unknown): error is DomainError {
  return error instanceof DomainError && error.status < 500;
}

/**
 * Whether a failed launch may succeed when tried again: anything but a lasting refusal (a lost
 * database connection, an unreachable image registry). A lasting refusal fails the step at once.
 */
export function isTemporaryLaunchFailure(error: unknown): boolean {
  return !isLastingRefusal(error);
}

/** What the failed step and its execution tell people about the launch that ended them. */
export function launchFailureMessage(failure: { error: unknown; failures: number }): string {
  const { error, failures } = failure;
  if (isLastingRefusal(error)) return error.message;
  const lastReason =
    error instanceof DomainError ? error.message : internalErrorDescription(error);
  return `ステップの起動が${failures}回続けて失敗したため、実行を止めました。最後の理由: ${lastReason}`;
}

// The message of an unexpected error can hold SQL text, so people see only its name and code; the
// API log (workflow_step_launch_failed) has the same, with the execution and step.
function internalErrorDescription(error: unknown): string {
  const { errorName, errorCode } = errorClue(error);
  return `APIの内部エラー（${[errorName, errorCode].filter(Boolean).join(' ')}）`;
}
