import type { WorkflowQualityGate } from '@mmt/contracts';
import { ChoiceField } from '../ChoiceField';
import { text } from '../../i18n/catalog';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

export function WorkflowGateEditor({
  gate,
  onChange,
  onRemove,
}: {
  gate: WorkflowQualityGate;
  onChange: (gate: WorkflowQualityGate) => void;
  onRemove: () => void;
}) {
  useLocale();
  return (
    <div className="workflow-gate workflow-fields">
      <label className="field">
        <span>{labels.workflowMetric}</span>
        <input
          value={gate.metric}
          placeholder="preprocessing.retained_input_ratio"
          onChange={(event) => onChange({ ...gate, metric: event.target.value })}
          required
        />
      </label>
      <ChoiceField
        label={labels.workflowOperator}
        value={gate.operator}
        options={[
          { value: 'gte', label: '≥' },
          { value: 'lte', label: '≤' },
          { value: 'eq', label: '=' },
        ]}
        onChange={(operator) => {
          if (operator === 'gte' || operator === 'lte' || operator === 'eq')
            onChange({ ...gate, operator });
        }}
      />
      <label className="field">
        <span>{labels.workflowThreshold}</span>
        <input
          type="number"
          step="any"
          value={gate.threshold}
          onChange={(event) => onChange({ ...gate, threshold: event.target.valueAsNumber })}
          required
        />
      </label>
      <button type="button" className="button small" onClick={onRemove}>
        {text.remove}
      </button>
    </div>
  );
}
