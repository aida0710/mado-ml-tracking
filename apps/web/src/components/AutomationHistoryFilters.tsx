import type { ModelAutomationRule } from '@mmt/contracts';
import type { AutomationExecutionFilter } from '../api/automation';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { buildCatalogOptions } from '../lib/catalogOptions';
import { text } from '../i18n/catalog';
import { automationText } from '../i18n/automation';

/** Narrows the automation history to one rule and/or one model version. */
export function AutomationHistoryFilters({
  filter,
  rules,
  catalog,
  onChange,
}: {
  filter: AutomationExecutionFilter;
  rules: readonly ModelAutomationRule[];
  catalog?: ExecutionCatalog;
  onChange: (filter: AutomationExecutionFilter) => void;
}) {
  const versionOptions = catalog ? buildCatalogOptions(catalog).models : [];
  return (
    <div className="automation-history-filters">
      <label className="field">
        <span>{text.automationRule}</span>
        <select
          value={filter.ruleId ?? ''}
          onChange={(event) => onChange({ ...filter, ruleId: event.target.value || undefined })}
        >
          <option value="">{automationText.historyAllRules}</option>
          {rules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{text.version}</span>
        <select
          value={filter.modelVersionId ?? ''}
          onChange={(event) =>
            onChange({ ...filter, modelVersionId: event.target.value || undefined })
          }
        >
          <option value="">{automationText.historyAllVersions}</option>
          {versionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
