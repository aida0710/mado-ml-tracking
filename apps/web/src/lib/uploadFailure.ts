import { isApiError, NETWORK_ERROR_CODE } from '@mado/design-system/http';
import type { UploadFailure } from '../types/uploadFailure';
import { formatErrorMessage } from './errorMessage';
import { LocalizedError } from './localizedError';
import type { UploadMethod } from './uploadPlan';
import type { ResumeBlocker } from './uploadResumeBlocker';
import { text } from '../i18n/catalog';
import { formatNote } from '../i18n/textJoining';
import { resumeBlockerNextSteps } from '../i18n/uploads';

export function formatUploadFailure(failure: UploadFailure): string {
  const reason = formatErrorMessage(failure.cause);
  return failure.kind === 'cancel' ? `${text.uploadCancelNotSent}: ${reason}` : reason;
}

/** サーバーからの応答ではなく、接続が切れたこと。 */
function isNetworkLoss(failure: unknown): boolean {
  return isApiError(failure) && failure.code === NETWORK_ERROR_CODE;
}

/**
 * 拒否された再開と切れた接続には、このファイルで次にすることを付け、それ以外の失敗は
 * そのままにする。再開を断った理由はAPIの文のまま、次にすることの後ろに括弧で添える。
 * どちらも表示するときに文にするので、あとで表示言語を変えても追従する。
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
      `${startsOver ? text.uploadRestartFromQueue : resumeBlockerNextSteps[blocker]}${formatNote(formatErrorMessage(failure))}`,
    );
  }
  if (isNetworkLoss(failure)) {
    return new LocalizedError(() =>
      method === 'multipart' ? text.uploadNetworkLostResume : text.uploadNetworkLostResend,
    );
  }
  return failure;
}
