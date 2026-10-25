import {
  isTrainingRunKind,
  type JsonObject,
  type ModelVersion,
  type ModelVersionTrainingSourceCreate,
  type Run,
} from '@mmt/contracts';
import { parseLocalDateTimeInput } from '@mado/design-system/datetime-input';
import type { FormValues } from '../types/form';
import {
  getFieldValue,
  getOptionalValue,
  getSelectedValues,
  parseJsonObject,
  parseStringMap,
} from './formValues';
import { LocalizedError } from './localizedError';
import { trainingText } from '../i18n/training';

export function getModelTrainingSourceRunId(
  version: Pick<ModelVersion, 'sourceRunId' | 'trainingSourceRunId'>,
): string | null {
  return version.trainingSourceRunId ?? version.sourceRunId;
}

export function isTrainingSourceCandidate(run: Run, modelVersionId: string): boolean {
  return (
    isTrainingRunKind(run.kind) &&
    ['finished', 'failed', 'canceled'].includes(run.status) &&
    run.modelVersionId !== modelVersionId
  );
}

function historicalTimestamp(value: string): string | null {
  if (!value) return null;
  const date = parseLocalDateTimeInput(value);
  if (!date) throw new LocalizedError(() => trainingText.invalidHistoricalTime);
  return date.toISOString();
}

export function buildModelTrainingSourceInput(
  values: FormValues,
): ModelVersionTrainingSourceCreate {
  const note = getFieldValue(values, 'note').trim();
  const evidence: JsonObject = note ? { note } : {};
  if (getFieldValue(values, 'mode') === 'existing')
    return { runId: getFieldValue(values, 'runId'), evidence };
  return {
    evidence,
    run: {
      name: getFieldValue(values, 'name'),
      experimentId: getFieldValue(values, 'experimentId'),
      kind: getFieldValue(values, 'kind') as 'training' | 'finetuning',
      inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
      modelVersionId: getOptionalValue(values, 'modelVersionId'),
      codeVersionId: getOptionalValue(values, 'codeVersionId'),
      parameters: parseJsonObject(getFieldValue(values, 'parameters')),
      tags: parseStringMap(getFieldValue(values, 'tags')),
      startedAt: historicalTimestamp(getFieldValue(values, 'startedAt')),
      endedAt: historicalTimestamp(getFieldValue(values, 'endedAt')),
    },
  };
}
