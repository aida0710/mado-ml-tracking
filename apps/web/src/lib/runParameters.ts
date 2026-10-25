import type { JsonObject, Run } from '@mmt/contracts';

export function getRunParameters(run: Pick<Run, 'parameters' | 'recordedParameters'>): JsonObject {
  // SDKの文字列は、固定した同じ値を表している。比較のために元の型の方を残す。
  return { ...run.recordedParameters, ...run.parameters };
}
