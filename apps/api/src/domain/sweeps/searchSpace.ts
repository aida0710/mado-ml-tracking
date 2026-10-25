import type { ApiErrorDetails, SweepSpaceViolation } from '@mmt/contracts';
import { DomainError } from '../errors.js';
import type {
  CategoricalParameter,
  ConstantParameter,
  DistributionParameter,
  ParameterDefinition,
  ParameterValue,
  SearchSpace,
  SweepMethod,
} from './types.js';

/** 1つの Sweep の parameter 数の上限。Run の params 一覧と画面の表で扱える数に抑える */
export const MAX_SWEEP_PARAMETERS = 50;
/** categorical の値の数の上限。grid の組み合わせ上限と合わせて提案の計算量を抑える */
export const MAX_CATEGORICAL_VALUES = 1000;
/** grid の組み合わせ数の上限。これを超える探索は random か bayes で行う */
export const MAX_GRID_COMBINATIONS = 10000;

const DISTRIBUTIONS = new Set(['uniform', 'log_uniform', 'int_uniform', 'q_uniform']);

export function isCategoricalParameter(definition: ParameterDefinition): definition is CategoricalParameter {
  return 'values' in definition;
}

export function isConstantParameter(definition: ParameterDefinition): definition is ConstantParameter {
  return 'value' in definition;
}

export function isDistributionParameter(definition: ParameterDefinition): definition is DistributionParameter {
  return 'distribution' in definition;
}

/** 提案と grid の列挙で使う決まった順（名前の符号単位での昇順。locale に依存させない） */
export function sortedParameterNames(space: SearchSpace): string[] {
  return Object.keys(space).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** grid で列挙する値（categorical は宣言順、constant は1つ） */
export function gridValues(definition: ParameterDefinition): ParameterValue[] {
  if (isCategoricalParameter(definition)) return definition.values;
  if (isConstantParameter(definition)) return [definition.value];
  throw new RangeError('a parameter with a continuous distribution cannot be enumerated for grid');
}

export function countGridCombinations(space: SearchSpace): number {
  return sortedParameterNames(space).reduce((count, name) => count * gridValues(space[name]!).length, 1);
}

/** 違反の理由と、文に入る値を横の項目にして 422 sweep_space_invalid を投げる。 */
function invalid(reason: SweepSpaceViolation, message: string, details: ApiErrorDetails = {}): never {
  throw new DomainError({
    status: 422,
    code: 'sweep_space_invalid',
    message,
    details: { reason, ...details },
  });
}

function isValidParameterValue(value: unknown): value is ParameterValue {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' || typeof value === 'boolean';
}

function validateCategorical(name: string, definition: CategoricalParameter): void {
  if (!Array.isArray(definition.values) || definition.values.length === 0)
    invalid('values_empty', `parameter "${name}" has no values`, { parameter: name });
  if (definition.values.length > MAX_CATEGORICAL_VALUES)
    invalid(
      'values_limit',
      `parameter "${name}" values exceed the limit of ${MAX_CATEGORICAL_VALUES} (received: ${definition.values.length})`,
      { parameter: name, limit: MAX_CATEGORICAL_VALUES, count: definition.values.length },
    );
  const seen = new Set<ParameterValue>();
  for (const value of definition.values) {
    if (!isValidParameterValue(value))
      invalid(
        'values_types',
        `parameter "${name}" values must be strings, finite numbers, or booleans`,
        { parameter: name },
      );
    // 重複があると grid が同じ組を2回試し、bayes の頻度推定も偏る。
    if (seen.has(value))
      invalid('values_duplicate', `parameter "${name}" has a duplicate value: ${JSON.stringify(value)}`, {
        parameter: name,
        value: JSON.stringify(value),
      });
    seen.add(value);
  }
}

function validateDistribution(name: string, definition: DistributionParameter): void {
  const { distribution, min, max, q } = definition;
  if (!DISTRIBUTIONS.has(distribution))
    invalid(
      'distribution_unsupported',
      `parameter "${name}" does not support distribution "${String(distribution)}"`,
      { parameter: name, distribution: String(distribution) },
    );
  if (!Number.isFinite(min) || !Number.isFinite(max))
    invalid('range_finite', `parameter "${name}" min and max must be finite numbers`, { parameter: name });
  if (!(min < max))
    invalid('range_order', `parameter "${name}" requires min < max (min=${min}, max=${max})`, {
      parameter: name,
      min: String(min),
      max: String(max),
    });
  if (distribution === 'log_uniform' && min <= 0)
    invalid(
      'log_uniform_positive',
      `parameter "${name}" uses log_uniform and requires min > 0 (min=${min})`,
      { parameter: name, min: String(min) },
    );
  if (distribution === 'int_uniform' && (!Number.isInteger(min) || !Number.isInteger(max)))
    invalid(
      'range_integers',
      `parameter "${name}" uses int_uniform and requires integer min and max`,
      { parameter: name },
    );
  if (q === undefined) return;
  if (distribution !== 'q_uniform')
    invalid('quantum_distribution', `parameter "${name}" q can only be specified for q_uniform`, {
      parameter: name,
    });
  if (!Number.isFinite(q) || q <= 0)
    invalid('quantum_positive', `parameter "${name}" q must be positive (q=${q})`, {
      parameter: name,
      q: String(q),
    });
  if (q > max - min)
    invalid('quantum_width', `parameter "${name}" q exceeds the range from min to max (q=${q})`, {
      parameter: name,
      q: String(q),
    });
}

function validateParameter(name: string, definition: ParameterDefinition): void {
  if (name.length === 0) invalid('parameter_name_empty', 'parameter names must not be empty');
  if (typeof definition !== 'object' || definition === null)
    invalid('definition_missing', `parameter "${name}" has no definition`, { parameter: name });
  const kinds = [isCategoricalParameter, isConstantParameter, isDistributionParameter].filter((is) => is(definition));
  if (kinds.length !== 1)
    invalid(
      'definition_ambiguous',
      `parameter "${name}" must specify exactly one of values, value, or distribution`,
      { parameter: name },
    );
  if (isCategoricalParameter(definition)) return validateCategorical(name, definition);
  if (isConstantParameter(definition)) {
    if (!isValidParameterValue(definition.value))
      invalid(
        'value_types',
        `parameter "${name}" value must be a string, finite number, or boolean`,
        { parameter: name },
      );
    return;
  }
  validateDistribution(name, definition);
}

/** 探索空間を検証する。違反は DomainError 422 sweep_space_invalid で、`reason` と該当する parameter を横に置く */
export function validateSearchSpace(space: SearchSpace, method: SweepMethod): void {
  const names = sortedParameterNames(space);
  if (names.length === 0) invalid('parameters_empty', 'at least one parameter is required');
  if (names.length > MAX_SWEEP_PARAMETERS)
    invalid(
      'parameter_limit',
      `parameters exceed the limit of ${MAX_SWEEP_PARAMETERS} (received: ${names.length})`,
      { limit: MAX_SWEEP_PARAMETERS, count: names.length },
    );
  for (const name of names) validateParameter(name, space[name]!);
  if (method !== 'grid') return;
  // W&B と同じく、連続分布は grid で列挙しない。
  const continuous = names.filter((name) => isDistributionParameter(space[name]!));
  if (continuous.length > 0)
    invalid(
      'grid_continuous',
      `grid search supports only values or value parameters (continuous distributions: ${continuous.join(', ')})`,
      { parameters: continuous },
    );
  const combinations = countGridCombinations(space);
  if (combinations > MAX_GRID_COMBINATIONS)
    invalid(
      'grid_limit',
      `grid combinations exceed the limit of ${MAX_GRID_COMBINATIONS} (requested: ${combinations})`,
      { limit: MAX_GRID_COMBINATIONS, count: combinations },
    );
}
