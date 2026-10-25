import type { JsonObject, JsonValue } from '@mmt/contracts';
import type { KeyValue, TrackingRun } from './trackingTypes.js';
import { invalidParameter } from './trackingValidation.js';

export function parameterString(value: JsonValue): string {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function matchesParameter(existing: JsonValue, value: string): boolean {
  if (parameterString(existing) === value) return true;
  // PythonのSDKは、真偽値とNoneを文字列にしてからRESTでparameterを送る。
  if (typeof existing === 'boolean') return value === (existing ? 'True' : 'False');
  return existing === null && value === 'None';
}
export function collectValues(entries: KeyValue[]): Record<string, string> {
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}
export function appendParameters(
  run: Pick<TrackingRun, 'parameters' | 'recordedParameters'>,
  entries: KeyValue[],
): JsonObject {
  // メトリクスやparameterのキーは、__proto__のような名前も含めてデータとして扱う。
  const parameters: JsonObject = Object.assign(
    Object.create(null),
    run.parameters,
    run.recordedParameters,
  );
  for (const { key, value } of entries) {
    if (Object.hasOwn(run.parameters, key) && !matchesParameter(run.parameters[key]!, value))
      invalidParameter(`params are immutable: ${key}`);
    if (Object.hasOwn(parameters, key)) {
      if (!matchesParameter(parameters[key]!, value)) invalidParameter(`params are immutable: ${key}`);
      continue;
    }
    parameters[key] = value;
  }
  return parameters;
}
