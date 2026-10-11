import { describe, expect, it } from 'vitest';
import type { CodeVersion } from '@mmt/contracts';
import { changeLaunchValues, initialLaunchValues, launchChoices } from './launchFormValues';
import { computeTarget, dockerCodeVersion } from '../../tests/fixtures/execution';

// A Python code for training only, beside the fixture's Docker code for inference and evaluation.
const pythonTrainingCode: CodeVersion = {
  ...dockerCodeVersion,
  id: 'python-train',
  runtime: { kind: 'python' },
  taskTypes: ['training'],
};
const dockerOnlyTarget = { ...computeTarget, id: 'docker-only', runtimeKinds: ['docker' as const] };
const candidates = {
  codeVersions: [dockerCodeVersion, pythonTrainingCode],
  modelVersions: [],
  targets: [computeTarget, dockerOnlyTarget],
};
const filled = {
  ...initialLaunchValues(undefined),
  kind: 'inference',
  codeVersionId: dockerCodeVersion.id,
  targetId: dockerOnlyTarget.id,
  gpuIds: ['0'],
};

describe('ジョブを起動する画面の選択の整合', () => {
  it('種別に合うコードだけを出し、外した数と、選んだコードのRuntimeを持つコンピュータを返す', () => {
    const choices = launchChoices(filled, candidates);
    expect(choices.compatibleCodes.map((code) => code.id)).toEqual([dockerCodeVersion.id]);
    expect(choices.hiddenCodeCount).toBe(1);
    expect(choices.selectedCode?.id).toBe(dockerCodeVersion.id);
    expect(choices.compatibleTargets.map((target) => target.id)).toEqual([
      computeTarget.id,
      dockerOnlyTarget.id,
    ]);
  });

  it('コードを選ぶまでは、コンピュータの候補を出さない', () => {
    expect(launchChoices({ ...filled, codeVersionId: '' }, candidates).compatibleTargets).toEqual([]);
  });

  it('種別を変えて合わなくなったコードを外し、外したことを返す', () => {
    const change = changeLaunchValues({
      previous: filled,
      next: { ...filled, kind: 'training' },
      candidates,
    });
    expect(change.values.codeVersionId).toBe('');
    expect(change.cleared).toContain('codeVersion');
  });

  it('コードを変えて、そのRuntimeが無いコンピュータをGPUごと外す', () => {
    const training = { ...filled, kind: 'training' };
    const change = changeLaunchValues({
      previous: training,
      next: { ...training, codeVersionId: pythonTrainingCode.id },
      candidates,
    });
    expect(change.values).toMatchObject({ targetId: '', gpuIds: [] });
    expect(change.cleared).toEqual(['target']);
  });
});
