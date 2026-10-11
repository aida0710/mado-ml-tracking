import {
  WORKFLOW_MAX_INPUTS,
  WORKFLOW_MAX_QUALITY_GATES,
  type ExperimentTask,
} from '@mmt/contracts';
import type { WorkflowStepDraft } from '../../lib/workflowDraft';
import { ChoiceField, type ChoiceOption } from '../ChoiceField';
import { WorkflowInputEditor } from './WorkflowInputEditor';
import { WorkflowGateEditor } from './WorkflowGateEditor';
import { text } from '../../i18n/catalog';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

// Start with a common retained-input threshold; each workflow can change it before saving.
const DEFAULT_MIN_RETAINED_INPUT_RATIO = 0.9;

export function WorkflowStepEditor({
  step,
  tasks,
  datasets,
  earlierSteps,
  onChange,
  onRemove,
}: {
  step: WorkflowStepDraft;
  tasks: ExperimentTask[];
  datasets: ChoiceOption[];
  earlierSteps: ChoiceOption[];
  onChange: (step: WorkflowStepDraft) => void;
  onRemove: () => void;
}) {
  useLocale();
  const update = (changes: Partial<WorkflowStepDraft>) => onChange({ ...step, ...changes });
  return (
    <fieldset className="workflow-step-editor">
      <legend>{step.name || labels.workflowSteps}</legend>
      <div className="workflow-fields">
        <label className="field">
          <span>{labels.workflowStepName}</span>
          <input
            value={step.name}
            required
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className="field">
          <span>{labels.workflowStepKey}</span>
          <input
            value={step.key}
            required
            onChange={(event) => update({ key: event.target.value })}
          />
        </label>
        <ChoiceField
          label={labels.workflowTask}
          value={step.taskId}
          options={tasks.map((task) => ({
            value: task.id,
            label: `${task.name} · ${text[task.kind]} · v${task.revision}`,
          }))}
          onChange={(taskId) => {
            const task = tasks.find((item) => item.id === taskId);
            update({
              taskId,
              name: step.name || task?.name || '',
              inputs:
                step.inputs.length || !task
                  ? step.inputs
                  : task.inputDatasetVersionIds.map((datasetVersionId) => ({
                      binding: {
                        source: { kind: 'dataset', datasetVersionId },
                        role:
                          task.kind === 'training' || task.kind === 'finetuning'
                            ? 'training'
                            : 'input',
                        weight: 1,
                        selection: {},
                      },
                      selectionJson: '{}',
                    })),
            });
          }}
        />
        <ChoiceField
          label={labels.workflowModelSource}
          value={step.modelFromStepKey ?? ''}
          options={[{ value: '', label: labels.workflowTaskModel }, ...earlierSteps]}
          onChange={(modelFromStepKey) => update({ modelFromStepKey: modelFromStepKey || null })}
        />
      </div>
      {step.inputs.map((input, index) => (
        <WorkflowInputEditor
          key={index}
          input={input}
          datasets={datasets}
          earlierSteps={earlierSteps}
          onChange={(next) =>
            update({
              inputs: step.inputs.map((item, position) => (position === index ? next : item)),
            })
          }
          onRemove={() =>
            update({ inputs: step.inputs.filter((_, position) => position !== index) })
          }
        />
      ))}
      <button
        type="button"
        className="button small"
        disabled={step.inputs.length >= WORKFLOW_MAX_INPUTS}
        onClick={() =>
          update({
            inputs: [
              ...step.inputs,
              {
                binding: {
                  source: { kind: 'dataset', datasetVersionId: '' },
                  role: 'input',
                  weight: 1,
                  selection: {},
                },
                selectionJson: '{}',
              },
            ],
          })
        }
      >
        {labels.workflowAddInput}
      </button>
      <p className="muted">{labels.workflowSelectionHint}</p>
      <h3>{labels.workflowQualityGates}</h3>
      {step.qualityGates.map((gate, index) => (
        <WorkflowGateEditor
          key={index}
          gate={gate}
          onChange={(next) =>
            update({
              qualityGates: step.qualityGates.map((item, position) =>
                position === index ? next : item,
              ),
            })
          }
          onRemove={() =>
            update({ qualityGates: step.qualityGates.filter((_, position) => position !== index) })
          }
        />
      ))}
      <button
        type="button"
        className="button small"
        disabled={step.qualityGates.length >= WORKFLOW_MAX_QUALITY_GATES}
        onClick={() =>
          update({
            qualityGates: [
              ...step.qualityGates,
              {
                metric: 'preprocessing.retained_input_ratio',
                operator: 'gte',
                threshold: DEFAULT_MIN_RETAINED_INPUT_RATIO,
              },
            ],
          })
        }
      >
        {labels.workflowAddGate}
      </button>
      <p className="muted">{labels.workflowGateHint}</p>
      <button type="button" className="button small danger" onClick={onRemove}>
        {text.remove}
      </button>
    </fieldset>
  );
}
