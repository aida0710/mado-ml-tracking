import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { MAX_CATEGORICAL_VALUES, MAX_GRID_COMBINATIONS, MAX_SWEEP_PARAMETERS, validateSearchSpace } from './searchSpace.js';
import type { SearchSpace, SweepMethod } from './types.js';

function rejection(space: SearchSpace, method: SweepMethod = 'random'): DomainError {
  try {
    validateSearchSpace(space, method);
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('検証が通ってしまいました');
}

describe('validateSearchSpace', () => {
  it('categorical・constant・各分布を混ぜた空間を random と bayes で受け付ける', () => {
    const space: SearchSpace = {
      optimizer: { values: ['adam', 'sgd'] },
      epochs: { value: 10 },
      lr: { distribution: 'log_uniform', min: 1e-5, max: 1e-1 },
      dropout: { distribution: 'uniform', min: 0, max: 0.5 },
      layers: { distribution: 'int_uniform', min: 1, max: 8 },
      batch: { distribution: 'q_uniform', min: 16, max: 256, q: 16 },
    };
    expect(() => validateSearchSpace(space, 'random')).not.toThrow();
    expect(() => validateSearchSpace(space, 'bayes')).not.toThrow();
  });

  it('違反は 422 sweep_space_invalid で、理由と該当する parameter 名を横の項目に置く', () => {
    const error = rejection({ lr: { distribution: 'uniform', min: 1, max: 1 } });
    expect(error.status).toBe(422);
    expect(error.code).toBe('sweep_space_invalid');
    expect(error.details).toEqual({ reason: 'range_order', parameter: 'lr', min: '1', max: '1' });
    expect(error.message).toBe('parameter "lr" requires min < max (min=1, max=1)');
  });

  it.each<[string, SearchSpace, Record<string, unknown>]>([
    ['parameter が無い', {}, { reason: 'parameters_empty' }],
    ['values が空', { a: { values: [] } }, { reason: 'values_empty', parameter: 'a' }],
    ['values が重複', { a: { values: [1, 2, 1] } }, { reason: 'values_duplicate', parameter: 'a', value: '1' }],
    ['values に NaN', { a: { values: [Number.NaN] } }, { reason: 'values_types', parameter: 'a' }],
    ['log_uniform で min が0', { lr: { distribution: 'log_uniform', min: 0, max: 1 } }, { reason: 'log_uniform_positive', parameter: 'lr', min: '0' }],
    ['int_uniform で小数', { n: { distribution: 'int_uniform', min: 0.5, max: 3 } }, { reason: 'range_integers', parameter: 'n' }],
    ['q を uniform に指定', { x: { distribution: 'uniform', min: 0, max: 1, q: 0.1 } }, { reason: 'quantum_distribution', parameter: 'x' }],
    ['q が0', { x: { distribution: 'q_uniform', min: 0, max: 1, q: 0 } }, { reason: 'quantum_positive', parameter: 'x', q: '0' }],
    ['min が無限大', { x: { distribution: 'uniform', min: -Infinity, max: 1 } }, { reason: 'range_finite', parameter: 'x' }],
    ['values と distribution の両方', { x: { values: [1], distribution: 'uniform', min: 0, max: 1 } as never }, { reason: 'definition_ambiguous', parameter: 'x' }],
    ['未知の distribution', { x: { distribution: 'normal', min: 0, max: 1 } as never }, { reason: 'distribution_unsupported', parameter: 'x', distribution: 'normal' }],
  ])('%s を拒否する', (_label, space, details) => {
    expect(rejection(space).details).toEqual(details);
  });

  it('parameter 数と categorical の値数の上限を超えると拒否する', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_SWEEP_PARAMETERS + 1 }, (_, index) => [`p${index}`, { value: index }]),
    );
    expect(rejection(tooMany).details).toEqual({
      reason: 'parameter_limit',
      limit: MAX_SWEEP_PARAMETERS,
      count: MAX_SWEEP_PARAMETERS + 1,
    });
    const manyValues = { a: { values: Array.from({ length: MAX_CATEGORICAL_VALUES + 1 }, (_, index) => index) } };
    expect(rejection(manyValues).details).toEqual({
      reason: 'values_limit',
      parameter: 'a',
      limit: MAX_CATEGORICAL_VALUES,
      count: MAX_CATEGORICAL_VALUES + 1,
    });
  });

  it('grid は連続分布の parameter を拒否し、どの parameter かを示す', () => {
    const error = rejection(
      { a: { values: [1, 2] }, lr: { distribution: 'uniform', min: 0, max: 1 } },
      'grid',
    );
    expect(error.details).toEqual({ reason: 'grid_continuous', parameters: ['lr'] });
  });

  it('grid の組み合わせ数が上限ちょうどなら受け付け、超えると拒否する', () => {
    const values = (count: number) => ({ values: Array.from({ length: count }, (_, index) => index) });
    expect(() => validateSearchSpace({ a: values(100), b: values(100) }, 'grid')).not.toThrow();
    const error = rejection({ a: values(100), b: values(100), c: values(2) }, 'grid');
    expect(error.details).toEqual({ reason: 'grid_limit', limit: MAX_GRID_COMBINATIONS, count: 20000 });
  });
});
