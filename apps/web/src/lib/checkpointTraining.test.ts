import { describe, expect, it } from 'vitest';
import type { Run, TrainingDataStagePage } from '@mmt/contracts';
import {
  canContinueTraining,
  checkpointTrainingValues,
  datasetVersionIdsAtStep,
  pinCheckpointTrainingInput,
} from './checkpointTraining';

const run = {
  id: 'original',
  projectId: 'project',
  name: 'Pretraining',
  kind: 'training',
  status: 'finished',
  experimentId: 'experiment',
  codeVersionId: 'code-v1',
  modelVersionId: 'base-model',
  inputDatasetVersionIds: ['original-data'],
  parameters: { learningRate: 0.01 },
  tags: { corpus: 'speech', 'mmt.workflow.id': 'old-workflow', 'automation.ruleId': 'old-rule' },
  environment: {
    machine: 'training-machine',
    runtime: { kind: 'python' },
    resume: { checkpointId: 'older-checkpoint' },
  },
} as unknown as Run;

describe('途中でデータを足して事前学習を続ける', () => {
  it('完了済みの事前学習やJobのないRunからも新しい学習を作れる', () => {
    expect(canContinueTraining(run)).toBe(true);
    expect(canContinueTraining({ ...run, kind: 'inference' })).toBe(false);
    expect(canContinueTraining({ ...run, codeVersionId: null })).toBe(false);
  });

  it('checkpointの次のstepで使う構成を引き継ぎ、後で足したデータは混ぜない', () => {
    const history = {
      initialStep: 0,
      initialDatasetVersionIds: ['a'],
      items: [
        { startStep: 1001, inputDatasetVersionIds: ['a', 'b'] },
        { startStep: 2001, inputDatasetVersionIds: ['b', 'c'] },
      ],
    } as TrainingDataStagePage;
    expect(datasetVersionIdsAtStep(history, 501)).toEqual(['a']);
    expect(datasetVersionIdsAtStep(history, 1001)).toEqual(['a', 'b']);
    expect(datasetVersionIdsAtStep(history, 2001)).toEqual(['b', 'c']);
  });

  it('新しいRunはユーザーの設定を保ち、元の自動実行や再開の設定を引き継がない', () => {
    const before = structuredClone(run);
    const values = checkpointTrainingValues({
      run,
      checkpoint: { id: 'checkpoint', step: 1000 },
      inputDatasetVersionIds: ['original-data', 'new-data'],
    });
    expect(values).toMatchObject({
      kind: 'training',
      codeVersionId: 'code-v1',
      inputDatasetVersionIds: ['original-data', 'new-data'],
    });
    expect(JSON.parse(values.tags as string)).toEqual({ corpus: 'speech' });
    expect(JSON.parse(values.environment as string)).toEqual({ machine: 'training-machine' });
    expect(run).toEqual(before);
    const input = pinCheckpointTrainingInput(
      {
        name: 'Next stage',
        experimentId: 'experiment',
        kind: 'training',
        inputDatasetVersionIds: ['original-data', 'new-data'],
      },
      {
        run,
        checkpoint: { id: 'checkpoint', step: 1000 },
        inputDatasetVersionIds: ['original-data'],
      },
    );
    expect(input).toMatchObject({
      kind: 'training',
      modelVersionId: 'base-model',
      resumeCheckpointId: 'checkpoint',
      parentRunId: 'original',
      inputDatasetVersionIds: ['original-data', 'new-data'],
    });
  });
});
