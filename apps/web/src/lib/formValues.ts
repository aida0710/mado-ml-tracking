import type { JsonObject } from '@mmt/contracts';
import type { FormField, FormValues } from '../types/form';
import { text } from '../i18n/catalog';

export type { FormValues } from '../types/form';
/** 値が1つの文字列ではなく、選んだ選択肢の一覧になる項目。 */
export const isMultiValueField = (field: Pick<FormField, 'type'>) =>
  field.type === 'multiselect' || field.type === 'checkboxes';
export function createInitialValues(fields: FormField[]): FormValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.defaultValue ?? (isMultiValueField(field) ? [] : ''),
    ]),
  );
}
export const getFieldValue = (values: FormValues, name: string) =>
  typeof values[name] === 'string' ? (values[name] as string) : '';
export const getSelectedValues = (values: FormValues, name: string): string[] =>
  Array.isArray(values[name]) ? (values[name] as string[]) : [];
export const getOptionalValue = (values: FormValues, name: string) =>
  getFieldValue(values, name).trim() || undefined;
/** `values`に`value`を足すか外したもの（一覧のチェックボックス）。残りの順は保つ。 */
export function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}
export const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value || '{}') as unknown;
  } catch {
    throw new Error(text.jsonError);
  }
}
export function parseJsonObject(value: string): JsonObject {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(text.jsonObjectError);
  return parsed as JsonObject;
}
/** 項目に書いたJSONのオブジェクト（空なら{}）。それ以外はnull。 */
export function parseJsonObjectOrNull(value: string): JsonObject | null {
  try {
    return parseJsonObject(value);
  } catch {
    return null;
  }
}
export function parseStringMap(value: string): Record<string, string> {
  const parsed = parseJsonObject(value);
  if (!Object.values(parsed).every((item) => typeof item === 'string'))
    throw new Error(text.stringMapError);
  return parsed as Record<string, string>;
}
export function parseStringArray(value: string): string[] {
  const parsed = parseJson(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === 'string') ||
    parsed.length === 0
  )
    throw new Error(text.stringArrayError);
  return parsed as string[];
}
/** selectの値を、その選択肢の1つとして返す。それ以外は`message`で断る。 */
export function parseChoice<T extends string>(
  value: string,
  choices: readonly T[],
  message: string = text.required,
): T {
  if (!choices.includes(value as T)) throw new Error(message);
  return value as T;
}
export function parsePositiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(text.positiveNumberError);
  return number;
}
