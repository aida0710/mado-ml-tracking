import { describe, expect, it } from 'vitest';
import type { CodeVersion, ModelVersion } from '@mmt/contracts';
import {
  isCodeCompatible,
  meetsCodeRequirement,
  validateCodeCompatibility,
} from './executionValidation';

const code = {
  runtime: { kind: 'python' },
  taskTypes: ['inference', 'training'],
  supportedModelFamilies: ['Qwen3'],
} as CodeVersion;
describe('実行するコードの互換性', () => {
  it('モデル系列と実行種別の両方が一致すると選択できる', () => {
    expect(isCodeCompatible(code, 'training', { family: 'Qwen3' } as ModelVersion)).toBe(true);
  });
  it('異なるモデル系列と未対応のfine-tuningを拒否する', () => {
    expect(() =>
      validateCodeCompatibility(code, 'inference', { family: 'Qwen2' } as ModelVersion),
    ).toThrow();
    expect(isCodeCompatible(code, 'finetuning', { family: 'Qwen3' } as ModelVersion)).toBe(false);
  });
  it('複数のモデル系列（フック・自動実行）は、すべてに対応しているときだけ満たす', () => {
    expect(meetsCodeRequirement(code, { taskType: 'inference', families: ['Qwen3'] })).toBe(true);
    expect(meetsCodeRequirement(code, { taskType: 'inference', families: ['Qwen3', 'Qwen2'] })).toBe(
      false,
    );
    // Nothing to check: a default code of a model version without a kind, or no model chosen.
    expect(meetsCodeRequirement(code, {})).toBe(true);
    expect(meetsCodeRequirement(code, { families: ['qwen3'] })).toBe(false);
  });
});
