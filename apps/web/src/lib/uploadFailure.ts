import type { UploadFailure } from '../types/uploadFailure';
import { text } from '../i18n/catalog';
import { formatErrorMessage } from './errorMessage';

export function formatUploadFailure(failure: UploadFailure): string {
  const reason = formatErrorMessage(failure.cause);
  return failure.kind === 'cancel' ? `${text.uploadCancelNotSent}: ${reason}` : reason;
}
