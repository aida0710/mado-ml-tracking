import { textTemplates } from '../i18n/catalog';

/**
 * Whether a comparison suits what its field holds, checked before the filter is sent so the
 * message can show the corrected comparison under the search box. Same rules as the API compiler
 * (apps/api/src/domain/runSearch/runSearchCompiler.ts): metrics are numbers, params, tags and
 * datasets are strings; attributes are left to the API since they differ by name.
 */
type FieldKind = 'number' | 'string';

const FIELD_KIND_BY_GROUP: Record<string, FieldKind> = {
  metric: 'number',
  metrics: 'number',
  param: 'string',
  params: 'string',
  parameter: 'string',
  parameters: 'string',
  tag: 'string',
  tags: 'string',
  dataset: 'string',
  datasets: 'string',
};
const NUMBER_ONLY_OPERATORS = new Set(['<', '<=', '>', '>=']);
const STRING_ONLY_OPERATORS = new Set(['LIKE', 'ILIKE']);

export interface FilterComparison {
  /** The field as written, split at its dots: `metrics.train.loss` is three parts. */
  fieldPath: readonly string[];
  /** Upper case, as the API compares it. */
  operator: string;
  value: { kind: 'quoted' | 'number'; text: string };
}

/** The message for a comparison that does not suit its field, or null. */
export function findComparisonKindError({ fieldPath, operator, value }: FilterComparison): string | null {
  const group = fieldPath.length > 1 ? fieldPath[0]!.toLowerCase() : '';
  const kind = FIELD_KIND_BY_GROUP[group];
  if (!kind) return null;
  const field = fieldPath.join('.');
  if (kind === 'string') {
    const quoted = value.kind === 'quoted' ? value.text : `'${value.text}'`;
    if (NUMBER_ONLY_OPERATORS.has(operator))
      return textTemplates.filterStringOperator({ field, operator, example: `${field} = ${quoted}` });
    if (value.kind === 'number')
      return textTemplates.filterQuoteValue(field, `${field} ${operator} ${quoted}`);
    return null;
  }
  if (STRING_ONLY_OPERATORS.has(operator)) return textTemplates.filterNumberOperator(field, operator);
  if (value.kind === 'quoted') return textTemplates.filterNumberValue(field);
  return null;
}
