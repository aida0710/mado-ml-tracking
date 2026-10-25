import { DomainError } from '../errors.js';
import { inClauseSql } from '../search/inClauseSql.js';

// ネイティブAPIもMLflow APIも、このコードをそれぞれの400の応答に変換する。
function invalidParameter(message: string): never {
  throw new DomainError({ status: 400, code: 'invalid_request', message });
}

export type SearchEntity = 'run' | 'experiment';
interface Token {
  kind: 'word' | 'quoted' | 'number' | 'symbol';
  value: string;
}
interface SearchField {
  expression: string;
  kind: 'string' | 'number';
  group: string;
  key: string;
}
export interface CompiledSearch {
  filter: string;
  orderBy: string;
  parameters: unknown[];
}

// フィルタに書くときの項目の形。直したフィルタを示すメッセージで使う。
function fieldLabel(field: SearchField): string {
  return `${field.group}.${field.key}`;
}

// 項目がどう比べられるかを伝える。`params.lr > 0.1`は自然に読めるが、paramsは文字列のため。
function unsupportedOperatorMessage(field: SearchField, operator: string): string {
  const label = fieldLabel(field);
  return field.kind === 'number'
    ? `unsupported comparison operator: ${operator}; ${label} is compared as a number, so use = != > >= < <= (for example ${label} < 0.1)`
    : `unsupported comparison operator: ${operator}; ${label} is compared as a string, so use = != LIKE ILIKE (for example ${label} = '0.01')`;
}

// MLflowは、昇順でも降順でも、数値のメトリクスをNaNや欠けたメトリクスより前に並べる。
const METRIC_SORT_PRIORITY = { number: 0, nan: 1, missing: 2 } as const;

const runAttributes: Record<string, { expression: string; kind: 'string' | 'number' }> = {
  run_id: { expression: 'r.id::text', kind: 'string' },
  run_uuid: { expression: 'r.id::text', kind: 'string' },
  experiment_id: { expression: 'r.experiment_id::text', kind: 'string' },
  run_name: { expression: 'r.name', kind: 'string' },
  user_id: {
    expression: 'COALESCE(r.mlflow_user_id,r.created_by::text)',
    kind: 'string',
  },
  status: {
    expression:
      "CASE r.status WHEN 'queued' THEN 'SCHEDULED' WHEN 'running' THEN 'RUNNING' WHEN 'finished' THEN 'FINISHED' WHEN 'failed' THEN 'FAILED' ELSE 'KILLED' END",
    kind: 'string',
  },
  start_time: {
    expression: '(EXTRACT(EPOCH FROM COALESCE(r.started_at,r.created_at))*1000)',
    kind: 'number',
  },
  end_time: {
    expression: '(EXTRACT(EPOCH FROM r.ended_at)*1000)',
    kind: 'number',
  },
  artifact_uri: {
    expression: "'mlflow-artifacts:/runs/'||r.id::text||'/artifacts'",
    kind: 'string',
  },
  lifecycle_stage: { expression: 'r.lifecycle_stage', kind: 'string' },
};
// attributes.statusはMLflowの名前で比べる。ネイティブの画面はこのAPI自身の名前を出すので、
// そちら（大文字小文字どちらも）も受け付ける。知らない名前は、黙って0件にせずエラーにする。
const MLFLOW_RUN_STATUSES = ['SCHEDULED', 'RUNNING', 'FINISHED', 'FAILED', 'KILLED'] as const;
const nativeStatusToMlflow: Record<string, (typeof MLFLOW_RUN_STATUSES)[number]> = {
  queued: 'SCHEDULED',
  claimed: 'SCHEDULED',
  running: 'RUNNING',
  finished: 'FINISHED',
  failed: 'FAILED',
  canceled: 'KILLED',
};

function mlflowRunStatus(value: string): string {
  const upper = value.toUpperCase();
  if ((MLFLOW_RUN_STATUSES as readonly string[]).includes(upper)) return upper;
  const mapped = nativeStatusToMlflow[value.toLowerCase()];
  if (mapped) return mapped;
  invalidParameter(
    `unsupported status: ${value} (allowed: ${[...MLFLOW_RUN_STATUSES, ...Object.keys(nativeStatusToMlflow)].join(', ')})`,
  );
}

const experimentAttributes: Record<string, { expression: string; kind: 'string' | 'number' }> = {
  name: { expression: 'e.name', kind: 'string' },
  experiment_id: { expression: 'e.id::text', kind: 'string' },
  creation_time: {
    expression: '(EXTRACT(EPOCH FROM e.created_at)*1000)',
    kind: 'number',
  },
  last_update_time: {
    expression: '(EXTRACT(EPOCH FROM e.updated_at)*1000)',
    kind: 'number',
  },
};

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /\s+|`(?:[^`]|``)*`|'(?:[^']|'')*'|"(?:[^"]|"")*"|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|!=|>=|<=|[=<>(),.]|[\p{L}_][\p{L}\p{N}_]*/uy;
  let offset = 0;
  while (offset < text.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if (!match) invalidParameter(`unsupported search syntax at position ${offset}`);
    const value = match[0];
    offset = pattern.lastIndex;
    if (/^\s/.test(value)) continue;
    const quote = value[0];
    if (quote === "'" || quote === '"' || quote === '`') {
      tokens.push({
        kind: 'quoted',
        value: value
          .slice(1, -1)
          .split(quote + quote)
          .join(quote),
      });
    } else if (/^[-+\d]/.test(value) || /^\.\d/.test(value)) {
      tokens.push({ kind: 'number', value });
    } else {
      tokens.push({
        kind: /^[\p{L}_]/u.test(value) ? 'word' : 'symbol',
        value,
      });
    }
  }
  return tokens;
}

class SearchCompiler {
  readonly parameters: unknown[];
  private tokens: Token[] = [];
  private offset = 0;
  constructor(
    private readonly entity: SearchEntity,
    initialParameters: unknown[],
  ) {
    this.parameters = [...initialParameters];
  }
  private bind(value: unknown): string {
    this.parameters.push(value);
    return `$${this.parameters.length}`;
  }
  private take(): Token {
    const token = this.tokens[this.offset++];
    if (!token) invalidParameter('the search expression ends unexpectedly');
    return token;
  }
  private accept(value: string): boolean {
    const token = this.tokens[this.offset];
    if (token?.kind === 'quoted' || token?.value.toUpperCase() !== value) return false;
    this.offset++;
    return true;
  }
  private field(): SearchField {
    const first = this.take();
    if (!['word', 'quoted'].includes(first.kind)) invalidParameter('invalid search attribute');
    let group = 'attributes';
    let key = first.value;
    if (this.accept('.')) {
      group = first.value.toLowerCase();
      const property = this.take();
      if (!['word', 'quoted'].includes(property.kind)) invalidParameter('invalid search key');
      key = property.value;
      while (this.accept('.')) {
        const suffix = this.take();
        if (!['word', 'quoted'].includes(suffix.kind)) invalidParameter('invalid search key');
        key += `.${suffix.value}`;
      }
    }
    if (['attribute', 'attr', 'run'].includes(group)) group = 'attributes';
    if (['metric'].includes(group)) group = 'metrics';
    if (['param', 'parameter', 'parameters'].includes(group)) group = 'params';
    if (group === 'tag') group = 'tags';
    if (group === 'dataset') group = 'datasets';
    if (group === 'attributes') {
      if (['created', 'Created'].includes(key)) key = 'start_time';
      if (['run name', 'Run name', 'Run Name'].includes(key)) key = 'run_name';
      const attributes = this.entity === 'run' ? runAttributes : experimentAttributes;
      if (!Object.hasOwn(attributes, key)) invalidParameter(`unsupported search attribute: ${key}`);
      const attribute = attributes[key]!;
      return { ...attribute, group, key };
    }
    const alias = this.entity === 'run' ? 'r' : 'e';
    if (group === 'tags' || (this.entity === 'run' && group === 'params')) {
      const values = group === 'params' ? '(r.parameters||r.recorded_parameters)' : `${alias}.tags`;
      return {
        expression: `${values} ->> ${this.bind(key)}::text`,
        kind: 'string',
        group,
        key,
      };
    }
    if (this.entity === 'run' && group === 'metrics') {
      return {
        expression: `(${alias}.latest_metrics ->> ${this.bind(key)}::text)::double precision`,
        kind: 'number',
        group,
        key,
      };
    }
    if (
      this.entity === 'run' &&
      group === 'datasets' &&
      ['name', 'digest', 'context'].includes(key)
    ) {
      return {
        expression: key === 'context' ? 'i.context' : `d.dataset ->> ${this.bind(key)}::text`,
        kind: 'string',
        group,
        key,
      };
    }
    invalidParameter(`unsupported search target: ${group}`);
  }
  private literal(field: SearchField): string | number {
    const token = this.take();
    if (field.kind === 'number') {
      if (token.kind !== 'number' || !Number.isFinite(Number(token.value)))
        invalidParameter(
          `the value of ${fieldLabel(field)} must be a number (for example ${fieldLabel(field)} < 0.1)`,
        );
      return Number(token.value);
    }
    if (token.kind !== 'quoted')
      invalidParameter(
        `the value of ${fieldLabel(field)} is a string, so put it in quotes (for example ${fieldLabel(field)} = '${token.value}')`,
      );
    return token.value;
  }
  private comparison(): string {
    const field = this.field();
    const token = this.take();
    let operator = token.value.toUpperCase();
    if (token.kind === 'quoted') invalidParameter('invalid comparison operator');
    if (operator === 'IS') {
      if (!['params', 'tags'].includes(field.group))
        invalidParameter('IS NULL is supported only for params and tags');
      const negative = this.accept('NOT');
      if (!this.accept('NULL')) invalidParameter('IS NULL or IS NOT NULL is required');
      return `(${field.expression}) IS ${negative ? 'NOT ' : ''}NULL`;
    }
    if (operator === 'NOT') {
      if (!this.accept('IN')) invalidParameter('NOT is supported only as NOT IN');
      operator = 'NOT IN';
    }
    let comparison: string;
    if (operator === 'IN' || operator === 'NOT IN') {
      if (field.group !== 'datasets' && !(field.group === 'attributes' && field.key === 'run_id'))
        invalidParameter('IN and NOT IN are supported only for the run_id and datasets attributes');
      if (!this.accept('(')) invalidParameter('IN requires a list of values in parentheses');
      const values: unknown[] = [this.literal(field)];
      while (this.accept(',')) values.push(this.literal(field));
      if (!this.accept(')')) invalidParameter('IN requires a closing parenthesis');
      comparison = inClauseSql({
        expression: field.expression,
        operator,
        valuesParameter: this.bind(values),
      });
    } else {
      const allowed =
        field.kind === 'number' ? ['=', '!=', '>', '>=', '<', '<='] : ['=', '!=', 'LIKE', 'ILIKE'];
      if (!allowed.includes(operator)) invalidParameter(unsupportedOperatorMessage(field, operator));
      const value = this.literal(field);
      const isStatusEquality =
        this.entity === 'run' &&
        field.group === 'attributes' &&
        field.key === 'status' &&
        (operator === '=' || operator === '!=');
      comparison = `(${field.expression}) ${operator} ${this.bind(
        isStatusEquality ? mlflowRunStatus(String(value)) : value,
      )}`;
    }
    if (field.group === 'datasets') {
      return `EXISTS (SELECT 1 FROM mlflow_run_dataset_inputs i JOIN mlflow_datasets d ON d.project_id=i.project_id AND d.dataset_version_id=i.dataset_version_id WHERE i.project_id=r.project_id AND i.run_id=r.id AND ${comparison})`;
    }
    if (field.group === 'metrics') {
      // PostgreSQLはNaNをどの数より大きいものとして扱う。SDKは!=のときだけNaNに合わせる。
      const nan = `(${field.expression}) = 'NaN'::double precision`;
      return operator === '!=' ? `(${nan}) OR (${comparison})` : `NOT (${nan}) AND (${comparison})`;
    }
    return comparison;
  }
  filter(filter: string): string {
    this.tokens = tokenize(filter);
    this.offset = 0;
    if (!this.tokens.length) return 'TRUE';
    const clauses = [this.comparison()];
    while (this.offset < this.tokens.length) {
      if (!this.accept('AND')) invalidParameter('only AND can combine search conditions');
      clauses.push(this.comparison());
    }
    return clauses.map((clause) => `(${clause})`).join(' AND ');
  }
  orderBy(orderBy: string[]): string {
    const clauses: string[] = [];
    for (const order of orderBy) {
      this.tokens = tokenize(order);
      this.offset = 0;
      const field = this.field();
      if (
        field.group === 'datasets' ||
        (this.entity === 'experiment' && field.group !== 'attributes')
      )
        invalidParameter('order_by is not supported for this target');
      const direction = this.accept('DESC') ? 'DESC' : 'ASC';
      if (direction === 'ASC') this.accept('ASC');
      if (this.offset !== this.tokens.length) invalidParameter('invalid order_by syntax');
      if (field.group === 'metrics') {
        clauses.push(
          `CASE WHEN (${field.expression}) = 'NaN'::double precision THEN ${METRIC_SORT_PRIORITY.nan}
          WHEN (${field.expression}) IS NULL THEN ${METRIC_SORT_PRIORITY.missing}
          ELSE ${METRIC_SORT_PRIORITY.number} END ASC`,
        );
      }
      clauses.push(`(${field.expression}) ${direction} NULLS LAST`);
    }
    const alias = this.entity === 'run' ? 'r' : 'e';
    if (!clauses.length)
      clauses.push(
        this.entity === 'run' ? 'COALESCE(r.started_at,r.created_at) DESC' : 'e.created_at DESC',
      );
    clauses.push(`${alias}.id ASC`);
    return clauses.join(',');
  }
}

/** SQLに変換する前の、MLflowの検索構文で書いたフィルタと並び順。 */
export interface SearchExpression {
  filter: string;
  orderBy: string[];
}

/**
 * MLflowの検索構文を、`runs r`か`experiments e`に対するSQLに変換する。値は常に`parameters`の
 * 後ろに足すので、呼び出し側は自分のプレースホルダーを先に置く。RunのparameterはMLflowの
 * 読み方と同じく、実行のparameterとSDKが記録したparameterを合わせ、後者を優先する。
 */
export function compileSearchExpression(
  entity: SearchEntity,
  search: SearchExpression,
  parameters: unknown[],
): CompiledSearch {
  const compiler = new SearchCompiler(entity, parameters);
  const filter = compiler.filter(search.filter);
  const orderBy = compiler.orderBy(search.orderBy);
  return { filter, orderBy, parameters: compiler.parameters };
}
