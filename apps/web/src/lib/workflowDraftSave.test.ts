import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/locale';
import { formatErrorMessage } from './errorMessage';
import { newDatasetInput } from './workflowDraft';
import { pinWorkflowDrafts } from './workflowDraftSave';
import {
  processingTask,
  savableWorkflowDraft,
  trainingTask,
} from '../../tests/fixtures/workflows';

afterEach(() => setLocale('ja'));

function failureOf(save: () => unknown): string {
  try {
    save();
  } catch (failure) {
    return formatErrorMessage(failure);
  }
  throw new Error('expected the draft to be refused');
}

describe('ワークフローの下書きの保存', () => {
  it('各ステップに、保存した時点の Task のリビジョンを固定する', () => {
    const pinned = pinWorkflowDrafts(savableWorkflowDraft(), [processingTask, trainingTask]);
    expect(pinned.map((item) => item.expectedTaskRevision)).toEqual([3, 5]);
    expect(pinned[1]!.inputs[0]!.source).toEqual({
      kind: 'step',
      stepKey: 'prepare',
      datasetName: null,
    });
  });

  it('保存できない理由を、ステップと入力の位置と種類ごとに示す', () => {
    const missingVersion = savableWorkflowDraft();
    missingVersion[0]!.inputs = [newDatasetInput()];
    expect(failureOf(() => pinWorkflowDrafts(missingVersion, [processingTask, trainingTask]))).toBe(
      'ステップ1の入力1: データセットバージョンを選んでください。',
    );

    const brokenSelection = savableWorkflowDraft();
    brokenSelection[1]!.inputs[0]!.selectionJson = '[1, 2]';
    expect(failureOf(() => pinWorkflowDrafts(brokenSelection, [processingTask, trainingTask]))).toBe(
      'ステップ2の入力1: 抽出条件は、{ } で囲んだ JSON のオブジェクトにしてください（条件が無ければ {}）。',
    );

    const zeroWeight = savableWorkflowDraft();
    zeroWeight[1]!.inputs[0]!.binding.weight = 0;
    expect(failureOf(() => pinWorkflowDrafts(zeroWeight, [processingTask, trainingTask]))).toBe(
      'ステップ2の入力1: 重みは0より大きい数にしてください。',
    );

    const laterModel = savableWorkflowDraft();
    laterModel[0]!.modelFromStepKey = 'train';
    expect(failureOf(() => pinWorkflowDrafts(laterModel, [processingTask, trainingTask]))).toBe(
      'ステップ1: 入力モデルの引き継ぎ元は、前のステップから選んでください。',
    );

    const duplicateKey = savableWorkflowDraft();
    duplicateKey[1]!.key = 'prepare';
    expect(failureOf(() => pinWorkflowDrafts(duplicateKey, [processingTask, trainingTask]))).toBe(
      'ステップ2: キー「prepare」は前のステップで使われています。別のキーにしてください。',
    );

    const unknownSummary = savableWorkflowDraft();
    unknownSummary[0]!.qualityGates = [
      { metric: 'preprocessing.snr_mean', operator: 'gte', threshold: 20 },
    ];
    expect(failureOf(() => pinWorkflowDrafts(unknownSummary, [processingTask, trainingTask]))).toMatch(
      /^ステップ1の品質条件1: preprocessing\. で始まるメトリクスは、前処理レポートの集計値（preprocessing\.input_count、/,
    );

    const noThreshold = savableWorkflowDraft();
    noThreshold[0]!.qualityGates = [{ metric: 'snr', operator: 'gte', threshold: Number.NaN }];
    expect(failureOf(() => pinWorkflowDrafts(noThreshold, [processingTask, trainingTask]))).toBe(
      'ステップ1の品質条件1: メトリクス名と、数値の閾値を入力してください。',
    );
  });

  it('保存できない理由は、表示言語を切り替えるとその言語で読める', () => {
    const missingTask = savableWorkflowDraft();
    missingTask[1]!.taskId = '';
    let failure: unknown;
    try {
      pinWorkflowDrafts(missingTask, [processingTask, trainingTask]);
    } catch (caught) {
      failure = caught;
    }
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe('Step 2: Choose a task.');
  });
});
