import type { WorkflowQualityGate } from '@mmt/contracts';
import { ChoiceField } from '../ChoiceField';
import { QUALITY_GATE_OPERATOR_SYMBOLS, RETAINED_INPUT_RATIO_METRIC } from '../../lib/workflowDraft';
import { text } from '../../i18n/catalog';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

const OPERATORS = Object.keys(QUALITY_GATE_OPERATOR_SYMBOLS) as WorkflowQualityGate['operator'][];

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
          placeholder={RETAINED_INPUT_RATIO_METRIC}
          onChange={(event) => onChange({ ...gate, metric: event.target.value })}
          required
        />
      </label>
      <ChoiceField
        label={labels.workflowOperator}
        value={gate.operator}
        placeholder={labels.workflowChoose}
        options={OPERATORS.map((operator) => ({
          value: operator,
          label: QUALITY_GATE_OPERATOR_SYMBOLS[operator],
        }))}
        onChange={(operator) => {
          const chosen = OPERATORS.find((candidate) => candidate === operator);
          if (chosen) onChange({ ...gate, operator: chosen });
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
