import { datasetParentsText } from '../i18n/datasetParents';
import { ApiError, INVALID_RESPONSE_CODE, NETWORK_ERROR_CODE } from '@mado/design-system/http';
import { ARTIFACT_TOO_LARGE_CODE } from '../api/http';
import { apiErrorMessage } from './apiErrorMessage';
import { LocalizedError } from './localizedError';
import { formatSweepSpaceError } from './sweepSpaceError';
import { text } from '../i18n/catalog';
import { localizeMessage } from '../i18n/messageTranslations';

// Webが文を持つコード。サーバーが何を送ってきても、表示言語の文で出す。
const webOwnedErrorText: Record<string, (failure: ApiError) => string | null> = {
  dataset_parent_cycle: () => datasetParentsText.parentCycle,
  [NETWORK_ERROR_CODE]: () => text.requestError,
  [INVALID_RESPONSE_CODE]: () => text.invalidResponse,
  // 前段のプロキシとAPIのどちらが断っても、このアップロードの上限は同じ言い方で伝える。
  [ARTIFACT_TOO_LARGE_CODE]: () => text.artifactTooLarge,
  // 探索空間の違反は、理由と横の項目から両方の言語の文を作る（parameter 名と値はそのまま出す）。
  sweep_space_invalid: (failure) => formatSweepSpaceError(failure.details),
};

/** 元の失敗を、今の表示言語の文にする。 */
export function formatErrorMessage(failure: unknown): string {
  if (failure instanceof ApiError) return formatRequestError(failure);
  if (failure instanceof LocalizedError) return failure.getLocalizedMessage();
  if (failure instanceof Error) return localizeMessage(failure.message);
  return localizeMessage(String(failure));
}

function formatRequestError(failure: ApiError): string {
  const webOwnedText = failure.code ? webOwnedErrorText[failure.code]?.(failure) : undefined;
  return webOwnedText ?? apiErrorMessage(failure);
}
