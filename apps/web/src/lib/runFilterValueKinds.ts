import { textTemplates } from '../i18n/catalog';

/**
 * 比較が項目の持つ値に合っているか。絞り込みを送る前に検査し、検索欄の下に直した比較を出せる
 * ようにする。APIのcompiler（apps/api/src/domain/runSearch/runSearchCompiler.ts）と同じ規則で、
 * メトリクスは数、パラメータ、タグ、データセットは文字列。属性は名前によって違うのでAPIに任せる。
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
  /** 書いたままの項目を点で分けたもの。`metrics.train.loss`は3つの部分になる。 */
  fieldPath: readonly string[];
  /** APIが比べるときと同じく大文字。 */
  operator: string;
  value: { kind: 'quoted' | 'number'; text: string };
}

/** 項目に合わない比較についてのメッセージ。無ければnull。 */
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
