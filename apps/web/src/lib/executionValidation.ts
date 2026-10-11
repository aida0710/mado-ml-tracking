import {
  MAX_JOB_ATTEMPTS,
  type CodeVersion,
  type ModelVersion,
  type RunKind,
} from '@mmt/contracts';
import { text } from '../i18n/catalog';
import { parsePositiveInteger } from './formValues';

export function parseMaxAttempts(value: string): number {
  const attempts = parsePositiveInteger(value);
  if (attempts > MAX_JOB_ATTEMPTS) throw new Error(text.maxAttemptsError);
  return attempts;
}

export const RUN_KINDS: RunKind[] = [
  'inference',
  'evaluation',
  'training',
  'finetuning',
  'processing',
];
/**
 * What a Run needs of its code version: to run `taskType`, and to support every family of
 * `families` (the models it runs). An omitted part is not checked.
 */
export interface CodeRequirement {
  taskType?: RunKind;
  families?: readonly string[];
}

/**
 * Whether the code version meets the requirement: the rule of the API's validateCodeCompatibility
 * (apps/api/src/domain/compatibility.ts). Every screen that offers code versions, or explains why
 * it offers none, asks this, so the rule lives only here.
 */
export function meetsCodeRequirement(
  code: CodeVersion,
  { taskType, families = [] }: CodeRequirement,
): boolean {
  return (
    (!taskType || code.taskTypes.includes(taskType)) &&
    families.every((family) => code.supportedModelFamilies.includes(family))
  );
}

export function isCodeCompatible(code: CodeVersion, kind: RunKind, model?: ModelVersion): boolean {
  return meetsCodeRequirement(code, { taskType: kind, families: model ? [model.family] : [] });
}
export function validateCodeCompatibility(
  code: CodeVersion | undefined,
  kind: RunKind,
  model?: ModelVersion,
) {
  if (code && !isCodeCompatible(code, kind, model)) throw new Error(text.launchBlocked);
}
