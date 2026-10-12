import type { ExperimentTask } from '@mmt/contracts';
import {
  newDatasetInput,
  newWorkflowStep,
  taskInputDrafts,
  type WorkflowStepDraft,
} from '../../src/lib/workflowDraft';

// IDs must be GUIDs: saving checks the steps with the API's schema.
export const DATASET_VERSION_ID = '00000000-0000-4000-8000-0000000000d1';
const createdAt = '2026-10-12T00:00:00Z';

export const workflowTask = (fields: Partial<ExperimentTask>): ExperimentTask => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  projectId: '00000000-0000-4000-8000-0000000000f1',
  experimentId: '00000000-0000-4000-8000-0000000000e1',
  name: '音声の前処理',
  description: '',
  kind: 'processing',
  codeVersionId: '00000000-0000-4000-8000-0000000000c1',
  modelVersionId: null,
  inputDatasetVersionIds: [DATASET_VERSION_ID],
  parameters: {},
  tags: {},
  targetId: '00000000-0000-4000-8000-0000000000b1',
  gpuIds: [],
  gpuCount: 0,
  walltimeSeconds: null,
  revision: 3,
  createdAt,
  updatedAt: createdAt,
  ...fields,
});
export const processingTask = workflowTask({});
export const trainingTask = workflowTask({
  id: '00000000-0000-4000-8000-0000000000a2',
  name: '音声の学習',
  kind: 'training',
  revision: 5,
});

/** Preprocessing ('prepare'), then training ('train') on its outputs: a draft that can be saved. */
export function savableWorkflowDraft(): WorkflowStepDraft[] {
  const fromPreprocessing = newDatasetInput('', 'training');
  fromPreprocessing.binding.source = { kind: 'step', stepKey: 'prepare', datasetName: null };
  const step = (fields: Partial<WorkflowStepDraft>): WorkflowStepDraft => ({
    ...newWorkflowStep([]),
    ...fields,
  });
  return [
    step({
      key: 'prepare',
      name: '前処理',
      taskId: processingTask.id,
      inputs: taskInputDrafts(processingTask),
    }),
    step({ key: 'train', name: '学習', taskId: trainingTask.id, inputs: [fromPreprocessing] }),
  ];
}
