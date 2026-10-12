import {
  ARTIFACT_CONTENT_UNAVAILABLE_CODE,
  ARTIFACT_TOO_LARGE_CODE,
  INVALID_RESPONSE_CODE,
  NETWORK_ERROR_CODE,
  RequestError,
} from '../api/http';
import { LocalizedError } from './localizedError';
import { formatSweepSpaceError } from './sweepSpaceError';
import { text } from '../i18n/catalog';
import { errorText } from '../i18n/errors';
import { getLocale } from '../i18n/locale';
import { localizeMessage } from '../i18n/messageTranslations';

// Codes whose text the Web owns, shown in the display language whatever the server sent.
const webOwnedErrorText: Record<string, (failure: RequestError) => string | null> = {
  [NETWORK_ERROR_CODE]: () => text.requestError,
  [INVALID_RESPONSE_CODE]: () => text.invalidResponse,
  // A front proxy and the API must describe this upload limit in the same way.
  [ARTIFACT_TOO_LARGE_CODE]: () => text.artifactTooLarge,
  [ARTIFACT_CONTENT_UNAVAILABLE_CODE]: (failure) => `${text.contentError} (${failure.status})`,
  // Only the API's known sentences are matched; parameter names and values stay verbatim.
  sweep_space_invalid: (failure) => formatSweepSpaceError(failure.serverMessage ?? ''),
};

/*
 * API codes whose server message is Japanese and names the operation (削除済みのRunは編集できません).
 * The Japanese screen keeps that more specific message; the English screen, which cannot show it,
 * uses this general translation of the code instead.
 */
const serverMessageTranslations: Record<string, keyof typeof errorText> = {
  model_training_source_conflict: 'modelTrainingSourceConflict',
  model_training_source_not_terminal: 'modelTrainingSourceNotTerminal',
  model_training_source_cycle: 'modelTrainingSourceCycle',
  training_data_run_kind: 'trainingDataRunKind',
  training_data_stage_conflict: 'trainingDataStageConflict',
  training_data_stage_order: 'trainingDataStageOrder',
  training_data_stage_checkpoint: 'trainingDataStageCheckpoint',
  training_data_stage_cycle: 'trainingDataStageCycle',
  internal_error: 'internalError',
  database_unavailable: 'databaseUnavailable',
  plugin_request_failed: 'pluginRequestFailed',
  plugin_disabled: 'pluginDisabled',
  upload_not_open: 'uploadNotOpen',
  upload_expired: 'uploadExpired',
  artifact_save_failed: 'artifactSaveFailed',
  part_checksum_mismatch: 'partChecksumMismatch',
  run_deleted: 'runDeleted',
  body_too_large: 'bodyTooLarge',
};

/** Turns the original failure into text for the current display language. */
export function formatErrorMessage(failure: unknown): string {
  if (failure instanceof RequestError) return formatRequestError(failure);
  if (failure instanceof LocalizedError) return failure.getLocalizedMessage();
  if (failure instanceof Error) return localizeMessage(failure.message);
  return localizeMessage(String(failure));
}

function formatRequestError(failure: RequestError): string {
  const webOwnedText = failure.code ? webOwnedErrorText[failure.code]?.(failure) : undefined;
  if (webOwnedText) return webOwnedText;
  const translationKey = failure.code ? serverMessageTranslations[failure.code] : undefined;
  const isServerMessageInDisplayLanguage = getLocale() === 'ja' && Boolean(failure.serverMessage);
  if (translationKey && !isServerMessageInDisplayLanguage) return errorText[translationKey];
  if (failure.serverMessage) return failure.serverMessage;
  return `${text.requestError} (${failure.status})`;
}
