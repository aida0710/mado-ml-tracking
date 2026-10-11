import {
  ARTIFACT_CONTENT_UNAVAILABLE_CODE,
  ARTIFACT_TOO_LARGE_CODE,
  INVALID_RESPONSE_CODE,
  NETWORK_ERROR_CODE,
  RequestError,
} from '../api/http';
import { text } from '../i18n/catalog';
import { errorText } from '../i18n/errors';
import { localizeMessage } from '../i18n/messageTranslations';
import { LocalizedError } from './localizedError';
import { formatSweepSpaceError } from './sweepSpaceError';

// Only unambiguous application-owned codes replace the server's original explanation.
const requestErrorText: Record<string, (failure: RequestError) => string | null> = {
  [NETWORK_ERROR_CODE]: () => text.requestError,
  [INVALID_RESPONSE_CODE]: () => text.invalidResponse,
  // A front proxy and the API must describe this upload limit in the same way.
  [ARTIFACT_TOO_LARGE_CODE]: () => text.artifactTooLarge,
  [ARTIFACT_CONTENT_UNAVAILABLE_CODE]: (failure) => `${text.contentError} (${failure.status})`,
  internal_error: () => errorText.internalError,
  database_unavailable: () => errorText.databaseUnavailable,
  plugin_request_failed: () => errorText.pluginRequestFailed,
  plugin_disabled: () => errorText.pluginDisabled,
  upload_not_open: () => errorText.uploadNotOpen,
  upload_expired: () => errorText.uploadExpired,
  artifact_save_failed: () => errorText.artifactSaveFailed,
  part_checksum_mismatch: () => errorText.partChecksumMismatch,
  run_deleted: () => errorText.runArchived,
  body_too_large: () => errorText.bodyTooLarge,
  sweep_space_invalid: (failure) => formatSweepSpaceError(failure.serverMessage ?? ''),
};

/** Turns the original failure into text for the current display language. */
export function formatErrorMessage(failure: unknown): string {
  if (failure instanceof RequestError) return formatRequestError(failure);
  if (failure instanceof LocalizedError) return failure.getLocalizedMessage();
  if (failure instanceof Error) return localizeMessage(failure.message);
  return localizeMessage(String(failure));
}

function formatRequestError(failure: RequestError): string {
  const describe = failure.code ? requestErrorText[failure.code] : undefined;
  const knownMessage = describe?.(failure);
  if (knownMessage) return knownMessage;
  if (failure.serverMessage) return failure.serverMessage;
  return `${text.requestError} (${failure.status})`;
}
