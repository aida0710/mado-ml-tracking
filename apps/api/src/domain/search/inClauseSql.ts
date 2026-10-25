export type InListOperator = 'IN' | 'NOT IN';

/**
 * MLflowの`IN (...)`・`NOT IN (...)`の比較を、text[]のバインドパラメータ1つと比べる形に
 * コンパイルする。リスト全体をバインドするので、値がいくつあってもSQLの形は変わらない。
 * NOT INはSQLの意味論に従う。式がNULLの行はINにもNOT INにも一致しない。
 */
export function inClauseSql(comparison: {
  expression: string;
  operator: InListOperator;
  valuesParameter: string;
}): string {
  const quantifier = comparison.operator === 'IN' ? '= ANY' : '<> ALL';
  return `(${comparison.expression}) ${quantifier}(${comparison.valuesParameter}::text[])`;
}
