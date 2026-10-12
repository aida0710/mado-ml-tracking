import { NETWORK_ERROR_CODE, RequestError } from '../api/http';
import type { UploadFailure } from '../types/uploadFailure';
import { formatErrorMessage } from './errorMessage';
import { LocalizedError } from './localizedError';
import type { UploadMethod } from './uploadPlan';
import type { ResumeBlocker } from './uploadResumeBlocker';
import { text } from '../i18n/catalog';
import { joinSentences } from '../i18n/textJoining';
import { resumeBlockerNextSteps, resumeBlockerReasons } from '../i18n/uploads';

export function formatUploadFailure(failure: UploadFailure): string {
  const reason = formatErrorMessage(failure.cause);
  return failure.kind === 'cancel' ? `${text.uploadCancelNotSent}: ${reason}` : reason;
}

/** A dropped connection, as opposed to an answer from the server. */
function isNetworkLoss(failure: unknown): boolean {
  return failure instanceof RequestError && failure.code === NETWORK_ERROR_CODE;
}

/**
 * A refused resume or a lost connection gets the next step for this file; any other failure stays
 * as it is. Both are put into words when shown, so they follow a later change of display language.
 */
export function explainUploadFailure({
  failure,
  blocker,
  startsOver,
  method,
}: {
  failure: unknown;
  blocker: ResumeBlocker | null;
  startsOver: boolean;
  method: UploadMethod;
}): unknown {
  if (blocker) {
    return new LocalizedError(() =>
      joinSentences([
        resumeBlockerReasons[blocker],
        startsOver ? text.uploadRestartFromQueue : resumeBlockerNextSteps[blocker],
      ]),
    );
  }
  if (isNetworkLoss(failure)) {
    return new LocalizedError(() =>
      method === 'multipart' ? text.uploadNetworkLostResume : text.uploadNetworkLostResend,
    );
  }
  return failure;
}
