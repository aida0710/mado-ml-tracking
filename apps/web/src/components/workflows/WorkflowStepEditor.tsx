import { useRef } from 'react';
import {
  WORKFLOW_MAX_INPUTS,
  WORKFLOW_MAX_QUALITY_GATES,
  type ExperimentTask,
} from '@mmt/contracts';
import {
  newDatasetInput,
  newRetainedInputGate,
  taskInputDrafts,
  type WorkflowStepDraft,
} from '../../lib/workflowDraft';
import { ChoiceField, type ChoiceOption } from '../ChoiceField';
import { WorkflowInputEditor } from './WorkflowInputEditor';
import { WorkflowGateEditor } from './WorkflowGateEditor';
import { MissingStepReferenceNotice } from './MissingStepReferenceNotice';
import { text } from '../../i18n/catalog';
import { workflowsText as labels, workflowsTextTemplates } from '../../i18n/workflows';
import { joinLabels } from '../../i18n/textJoining';
import { useLocale } from '../../i18n/useLocale';

/**
 * One step of the definition. A changed key is reported once the field is left
 * (`onKeyRenamed`), so the steps after it can follow the new key instead of each keystroke.
 */
export function WorkflowStepEditor({
  step,
  tasks,
  datasets,
  earlierSteps,
  onChange,
  onKeyRenamed,
  onRemove,
}: {
  step: WorkflowStepDraft;
  tasks: ExperimentTask[];
  datasets: ChoiceOption[];
  earlierSteps: ChoiceOption[];
  onChange: (step: WorkflowStepDraft) => void;
  onKeyRenamed: (rename: { from: string; to: string }) => void;
  onRemove: () => void;
}) {
  useLocale();
  const keyWhenFocused = useRef(step.key);
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
        <div>
          <label className="field">
            <span>{labels.workflowStepKey}</span>
            <input
              value={step.key}
              required
              onFocus={() => {
                keyWhenFocused.current = step.key;
              }}
              onBlur={() => {
                if (keyWhenFocused.current !== step.key)
                  onKeyRenamed({ from: keyWhenFocused.current, to: step.key });
              }}
              onChange={(event) => update({ key: event.target.value })}
            />
          </label>
          {/* References do not follow a key an earlier step already has, so the clash shows here. */}
          {earlierSteps.some((earlier) => earlier.value === step.key) && (
            <p className="notice error" role="status">
              {workflowsTextTemplates.workflowDraftDuplicateKey(step.key)}
            </p>
          )}
        </div>
        <ChoiceField
          label={labels.workflowTask}
          value={step.taskId}
          placeholder={labels.workflowChoose}
          options={tasks.map((task) => ({
            value: task.id,
            label: joinLabels([
              task.name,
              text[task.kind],
              workflowsTextTemplates.workflowVersionLabel(task.revision),
            ]),
          }))}
          onChange={(taskId) => {
            const task = tasks.find((item) => item.id === taskId);
            update({
              taskId,
              name: step.name || task?.name || '',
              inputs: step.inputs.length || !task ? step.inputs : taskInputDrafts(task),
            });
          }}
        />
        <div>
          <ChoiceField
            label={labels.workflowModelSource}
            value={step.modelFromStepKey ?? ''}
            placeholder={labels.workflowChoose}
            options={[{ value: '', label: labels.workflowTaskModel }, ...earlierSteps]}
            onChange={(modelFromStepKey) => update({ modelFromStepKey: modelFromStepKey || null })}
          />
          <MissingStepReferenceNotice stepKey={step.modelFromStepKey} earlierSteps={earlierSteps} />
        </div>
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
        onClick={() => update({ inputs: [...step.inputs, newDatasetInput()] })}
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
        onClick={() => update({ qualityGates: [...step.qualityGates, newRetainedInputGate()] })}
      >
        {labels.workflowAddGate}
      </button>
      <p className="muted">{labels.workflowGateHint}</p>
      <button type="button" className="button small danger" onClick={onRemove}>
        {labels.workflowRemoveStep}
      </button>
    </fieldset>
  );
}
