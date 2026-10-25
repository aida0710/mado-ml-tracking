import { describe, expect, it } from 'vitest';
import {
  defaultInputRole,
  earlierStepChoices,
  newDatasetInput,
  newWorkflowStep,
  renameStepReferences,
  taskInputDrafts,
  type WorkflowStepDraft,
} from './workflowDraft';
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

/** prepare → train → evaluate。評価のステップは、学習したモデルと学習の出力を受け取る。 */
function threeStepDraft(): WorkflowStepDraft[] {
  const fromTraining = newDatasetInput('', 'test');
  fromTraining.binding.source = { kind: 'step', stepKey: 'train', datasetName: null };
  const evaluate: WorkflowStepDraft = {
    ...newWorkflowStep([]),
    key: 'evaluate',
    name: '評価',
    taskId: processingTask.id,
    modelFromStepKey: 'train',
    inputs: [fromTraining],
  };
  return [...savableWorkflowDraft(), evaluate];
}

/** `stepIndex`のステップのキーに`to`を打ち込んで欄を離れる。ダイアログでの操作と同じ。 */
function renameKey(steps: WorkflowStepDraft[], stepIndex: number, to: string): WorkflowStepDraft[] {
  const from = steps[stepIndex]!.key;
  const typed = steps.map((step, index) => (index === stepIndex ? { ...step, key: to } : step));
  return renameStepReferences(typed, { stepIndex, from, to });
}

const firstInputSourceOf = (step: WorkflowStepDraft | undefined) => step!.inputs[0]!.binding.source;

describe('ステップのキーの変更', () => {
  it('後のステップの入力とモデルの引き継ぎ元を、新しいキーへ付け替える', () => {
    const draft = savableWorkflowDraft();
    draft[1]!.modelFromStepKey = 'prepare';
    const renamed = renameKey(draft, 0, 'clean');
    expect(renamed[1]!.modelFromStepKey).toBe('clean');
    expect(firstInputSourceOf(renamed[1])).toMatchObject({ stepKey: 'clean' });
  });

  it('変えたステップより前のステップの参照は、同じキーでも付け替えない', () => {
    const draft = threeStepDraft();
    // ステップは後のステップを参照できない。そうした参照は、選び直すまで下書きに残る。
    draft[0]!.modelFromStepKey = 'train';
    const renamed = renameKey(draft, 1, 'fit');
    expect(renamed[0]!.modelFromStepKey).toBe('train');
    expect(renamed[2]!.modelFromStepKey).toBe('fit');
    expect(firstInputSourceOf(renamed[2])).toMatchObject({ stepKey: 'fit' });
  });

  it('キーを前のステップと同じにしてから直しても、ほかのステップの参照を書き換えない', () => {
    // trainをprepare（ステップ1のキー）と打ち間違え、そのあとtrain2に直す。
    const mistyped = renameKey(threeStepDraft(), 1, 'prepare');
    expect(mistyped[2]!.modelFromStepKey).toBe('train');
    const corrected = renameKey(mistyped, 1, 'train2');
    // ステップ2は、自分自身ではなく、引き続きステップ1の出力を読む。
    expect(firstInputSourceOf(corrected[1])).toMatchObject({ stepKey: 'prepare' });
    // 評価の参照は元のままで、無いものとして表示され、選び直すのを待つ。
    expect(corrected[2]!.modelFromStepKey).toBe('train');
    expect(firstInputSourceOf(corrected[2])).toMatchObject({ stepKey: 'train' });
  });

  it('キーを空にしても付け替えず、参照は見つからないものとして残す', () => {
    const draft = savableWorkflowDraft();
    expect(renameStepReferences(draft, { stepIndex: 0, from: 'prepare', to: '' })).toBe(draft);
  });
});

describe('引き継ぎ元に選べる前のステップ', () => {
  it('前のステップのキーを1つずつ並べ、空のキーは選択肢にしない', () => {
    const draft = threeStepDraft();
    draft[1]!.key = 'prepare';
    draft.splice(2, 0, { ...newWorkflowStep([]), key: '', name: '名前だけ' });
    expect(earlierStepChoices(draft, 3)).toEqual([{ value: 'prepare', label: '前処理' }]);
    expect(earlierStepChoices(draft, 0)).toEqual([]);
  });
});
