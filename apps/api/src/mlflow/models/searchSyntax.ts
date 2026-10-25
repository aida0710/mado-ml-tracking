import { inClauseSql, type InListOperator } from '../../domain/search/inClauseSql.js';
import { invalidParameter } from './validation.js';

export class SqlParameters {
  readonly values: unknown[];
  constructor(initial: unknown[] = []) {
    this.values = [...initial];
  }
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export interface SearchField {
  expression: string;
  numeric: boolean;
  // MLflowは、モデルバージョン検索の文字列の属性に限ってIN / NOT INを受け付ける。
  acceptsInList?: boolean;
  // MLflowは引用符付きのversion_numberをint()で変換するので、version_number = '3'でも一致する。
  acceptsQuotedInteger?: boolean;
  compileComparison?: (comparison: { operator: string; valueParameter: string }) => string;
}
type ResolveField = (field: string) => SearchField;
// PostgreSQLのepochの値は秒単位で、protobufとJavaScriptの日時は整数のミリ秒単位。
const MILLISECONDS_PER_SECOND = 1000;

export function timestampInMillisecondsSql(column: string): string {
  return `(floor(extract(epoch FROM ${column})*${MILLISECONDS_PER_SECOND}))::bigint`;
}

// 句を1つずつトークンに分け、引用符で囲んだタグの値の中のANDをリテラルのまま扱う。
const FIELD_AND_OPERATOR_PATTERN =
  /\s*([A-Za-z_][A-Za-z_0-9]*(?:\.(?:`[^`]+`|"[^"]+"|'[^']+'|[A-Za-z_0-9./-]+))?)\s*(!=|>=|<=|=|>|<|ILIKE\b|LIKE\b|NOT\s+IN\b|IN\b)\s*/iy;
const LITERAL_PATTERN =
  /('(?:[^']|'')*'|"(?:[^"]|"")*"|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
const LIST_START_PATTERN = /\(\s*/y;
const LIST_ITEM_PATTERN = /('(?:[^']|'')*'|"(?:[^"]|"")*")\s*(,\s*|\))/y;
// 符号を付けてもよい数字の並び。Pythonのint()が読める引用符付きの形。
const QUOTED_INTEGER_PATTERN = /^[+-]?\d+$/;

interface CompiledComparison {
  sql: string;
  end: number;
}
interface ComparisonInput {
  filter: string;
  offset: number;
  field: SearchField;
  parameters: SqlParameters;
}

function readPattern(pattern: RegExp, text: string, offset: number): RegExpExecArray | null {
  pattern.lastIndex = offset;
  return pattern.exec(text);
}

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(literal[0] === "'" ? /''/g : /""/g, literal[0]!);
}

function readValueList(filter: string, offset: number): { values: string[]; end: number } {
  if (!readPattern(LIST_START_PATTERN, filter, offset))
    invalidParameter('IN and NOT IN require a list of values in parentheses');
  const values: string[] = [];
  let position = LIST_START_PATTERN.lastIndex;
  for (;;) {
    const item = readPattern(LIST_ITEM_PATTERN, filter, position);
    if (!item) invalidParameter('separate the values of IN and NOT IN with commas, as quoted strings');
    values.push(unquote(item[1]!));
    position = LIST_ITEM_PATTERN.lastIndex;
    if (item[2] === ')') return { values, end: position };
  }
}

function compileListComparison(
  input: ComparisonInput & { operator: InListOperator },
): CompiledComparison {
  if (!input.field.acceptsInList)
    invalidParameter('IN and NOT IN are supported only for string attributes of model versions');
  const list = readValueList(input.filter, input.offset);
  return {
    sql: inClauseSql({
      expression: input.field.expression,
      operator: input.operator,
      valuesParameter: input.parameters.add(list.values),
    }),
    end: list.end,
  };
}

function compileValueComparison(input: ComparisonInput & { operator: string }): CompiledComparison {
  const match = readPattern(LITERAL_PATTERN, input.filter, input.offset);
  if (!match) invalidParameter('unsupported search filter syntax');
  const { field, operator } = input;
  const literal = match[1]!;
  const isQuoted = literal.startsWith("'") || literal.startsWith('"');
  const value = isQuoted ? unquote(literal) : literal;
  const isAcceptedQuotedInteger =
    !!field.acceptsQuotedInteger && QUOTED_INTEGER_PATTERN.test(value);
  if (
    field.numeric
      ? (isQuoted && !isAcceptedQuotedInteger) ||
        !Number.isFinite(Number(value)) ||
        ['LIKE', 'ILIKE'].includes(operator)
      : !isQuoted || !['=', '!=', 'LIKE', 'ILIKE'].includes(operator)
  ) {
    invalidParameter('the type of the search field does not match the comparison operator');
  }
  // 整数の精度を保つ。数値の型はPostgreSQLが比べる相手のフィールドから推論する。
  const valueParameter = input.parameters.add(value);
  return {
    sql: field.compileComparison
      ? field.compileComparison({ operator, valueParameter })
      : `${field.expression} ${operator} ${valueParameter}`,
    end: LITERAL_PATTERN.lastIndex,
  };
}

export function compileFilter(input: {
  filter: string;
  parameters: SqlParameters;
  resolveField: ResolveField;
}): string {
  if (!input.filter.trim()) return 'TRUE';
  let offset = 0;
  const comparisons: string[] = [];
  while (offset < input.filter.length) {
    const clause = readPattern(FIELD_AND_OPERATOR_PATTERN, input.filter, offset);
    if (!clause) invalidParameter('unsupported search filter syntax');
    const comparisonInput: ComparisonInput = {
      filter: input.filter,
      offset: FIELD_AND_OPERATOR_PATTERN.lastIndex,
      field: input.resolveField(clause[1]!),
      parameters: input.parameters,
    };
    const operator = clause[2]!.toUpperCase().replace(/\s+/g, ' ');
    const comparison =
      operator === 'IN' || operator === 'NOT IN'
        ? compileListComparison({ ...comparisonInput, operator })
        : compileValueComparison({ ...comparisonInput, operator });
    comparisons.push(comparison.sql);
    offset = comparison.end;
    const remainder = input.filter.slice(offset);
    if (!remainder.trim()) break;
    const separator = /^\s+AND\s+/i.exec(remainder);
    if (!separator) invalidParameter('search filters support only conditions combined with AND');
    offset += separator[0].length;
    if (offset === input.filter.length) invalidParameter('a search condition is required after AND');
  }
  return comparisons.join(' AND ');
}

export function splitSearchField(field: string): { kind: string; key: string } {
  const separator = field.indexOf('.');
  if (separator < 0) return { kind: 'attributes', key: field };
  const kind = field.slice(0, separator);
  const rawKey = field.slice(separator + 1);
  const key = /^[`'"]/.test(rawKey) ? rawKey.slice(1, -1) : rawKey;
  if (!key) invalidParameter('empty search key');
  return { kind, key };
}
