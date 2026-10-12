import { describe, expect, it } from 'vitest';
import { defaultInputRole, renameStepReferences, taskInputDrafts } from './workflowDraft';
import {
  DATASET_VERSION_ID,
  processingTask,
  savableWorkflowDraft,
  trainingTask,
  workflowTask,
} from '../../tests/fixtures/workflows';

describe('Task からの入力の初期値', () => {
  it('学習とファインチューニングの Task を選ぶと、Task の入力を学習用として取り込む', () => {
    expect(defaultInputRole(trainingTask)).toBe('training');
    expect(defaultInputRole(workflowTask({ kind: 'finetuning' }))).toBe('training');
    expect(defaultInputRole(processingTask)).toBe('input');
    expect(taskInputDrafts(trainingTask).map((input) => input.binding)).toEqual([
      {
        source: { kind: 'dataset', datasetVersionId: DATASET_VERSION_ID },
        role: 'training',
        weight: 1,
        selection: {},
      },
    ]);
  });
});

describe('ステップのキーの変更', () => {
  it('後のステップの入力とモデルの引き継ぎ元を、新しいキーへ付け替える', () => {
    const draft = savableWorkflowDraft();
    draft[1]!.modelFromStepKey = 'prepare';
    const renamed = renameStepReferences(draft, { from: 'prepare', to: 'clean' });
    expect(renamed[1]!.modelFromStepKey).toBe('clean');
    expect(renamed[1]!.inputs[0]!.binding.source).toMatchObject({ stepKey: 'clean' });
  });

  it('キーを空にしても付け替えず、参照は見つからないものとして残す', () => {
    const draft = savableWorkflowDraft();
    expect(renameStepReferences(draft, { from: 'prepare', to: '' })).toBe(draft);
  });
});
