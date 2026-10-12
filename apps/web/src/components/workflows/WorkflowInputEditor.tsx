import { DATASET_USAGE_ROLES } from '@mmt/contracts';
import type { WorkflowInputDraft } from '../../lib/workflowDraft';
import { ChoiceField, type ChoiceOption } from '../ChoiceField';
import { MissingStepReferenceNotice } from './MissingStepReferenceNotice';
import { text } from '../../i18n/catalog';
import { workflowsText as labels } from '../../i18n/workflows';
import { datasetRoleLabel } from '../../lib/workflowLabels';
import { useLocale } from '../../i18n/useLocale';

// The contract takes a weight above 0; the smallest positive number makes the browser's own check
// refuse 0 and below while still taking any positive weight.
const MIN_POSITIVE_WEIGHT = Number.MIN_VALUE;

export function WorkflowInputEditor({
  input,
  datasets,
  earlierSteps,
  onChange,
  onRemove,
}: {
  input: WorkflowInputDraft;
  datasets: ChoiceOption[];
  earlierSteps: ChoiceOption[];
  onChange: (input: WorkflowInputDraft) => void;
  onRemove: () => void;
}) {
  useLocale();
  const { binding, selectionJson } = input;
  const update = (changes: Partial<typeof binding>) =>
    onChange({ ...input, binding: { ...binding, ...changes } });
  const source = binding.source;
  return (
    <fieldset className="workflow-input">
      <legend>{labels.workflowInputs}</legend>
      <div className="workflow-fields">
        <ChoiceField
          label={labels.workflowSource}
          value={source.kind}
          placeholder={labels.workflowChoose}
          options={[
            { value: 'dataset', label: labels.workflowFixedDataset },
            { value: 'step', label: labels.workflowStepDataset },
          ]}
          onChange={(kind) =>
            update({
              source:
                kind === 'dataset'
                  ? { kind: 'dataset', datasetVersionId: '' }
                  : { kind: 'step', stepKey: '', datasetName: null },
            })
          }
        />
        {source.kind === 'dataset' ? (
          <ChoiceField
            label={labels.workflowDatasetVersion}
            value={source.datasetVersionId}
            placeholder={labels.workflowChoose}
            options={datasets}
            onChange={(datasetVersionId) => update({ source: { ...source, datasetVersionId } })}
          />
        ) : (
          <>
            <div>
              <ChoiceField
                label={labels.workflowSourceStep}
                value={source.stepKey}
                placeholder={labels.workflowChoose}
                options={earlierSteps}
                onChange={(stepKey) => update({ source: { ...source, stepKey } })}
              />
              <MissingStepReferenceNotice stepKey={source.stepKey} earlierSteps={earlierSteps} />
            </div>
            <label className="field">
              <span>{labels.workflowDatasetName}</span>
              <input
                value={source.datasetName ?? ''}
                onChange={(event) =>
                  update({ source: { ...source, datasetName: event.target.value || null } })
                }
              />
            </label>
          </>
        )}
        <ChoiceField
          label={labels.workflowRole}
          value={binding.role}
          placeholder={labels.workflowChoose}
          options={DATASET_USAGE_ROLES.map((role) => ({
            value: role,
            label: datasetRoleLabel(role),
          }))}
          onChange={(role) => {
            if (DATASET_USAGE_ROLES.includes(role as typeof binding.role))
              update({ role: role as typeof binding.role });
          }}
        />
        <label className="field">
          <span>{labels.workflowWeight}</span>
          <input
            type="number"
            min={MIN_POSITIVE_WEIGHT}
            step="any"
            value={binding.weight}
            onChange={(event) => update({ weight: event.target.valueAsNumber })}
            required
          />
        </label>
      </div>
      <label className="field">
        <span>{labels.workflowSelection}</span>
        <textarea
          rows={2}
          value={selectionJson}
          spellCheck={false}
          onChange={(event) => onChange({ ...input, selectionJson: event.target.value })}
        />
      </label>
      <button type="button" className="button small" onClick={onRemove}>
        {text.remove}
      </button>
    </fieldset>
  );
}
