import { useState } from 'react';
import type { ModelAutomationRule } from '@mmt/contracts';
import type { AutomationCatalog } from '../types/modelAutomation';
import { useAutomationRuleForm } from '../hooks/useAutomationRuleForm';
import { useProject } from '../hooks/useProject';
import { Dialog } from '../components/Dialog';
import { AutomationRuleFields } from '../components/AutomationRuleFields';
import { ErrorNotice } from '../components/Feedback';
import {
  createAutomationValues,
  createAutomationValuesFromRule,
  downstreamRules,
} from '../lib/modelAutomationInput';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { automationText } from '../i18n/automation';

/** What was saved, and whether the rule it was copied from should now be disabled. */
export interface SavedAutomationRule {
  rule: ModelAutomationRule;
  disableSource: boolean;
}

/**
 * Creates a rule, from scratch or from `source`'s settings. A copy offers to disable its source,
 * since the two would otherwise both start Jobs for the same versions.
 */
export function AutomationRuleDialog({
  catalog,
  initialFamilies,
  source,
  onClose,
  onSaved,
}: {
  catalog: AutomationCatalog;
  initialFamilies: string[];
  source?: ModelAutomationRule;
  onClose: () => void;
  onSaved: (saved: SavedAutomationRule) => void;
}) {
  useLocale();
  const { project } = useProject();
  const form = useAutomationRuleForm({
    projectId: project.id,
    catalog,
    initialValues: () =>
      source ? createAutomationValuesFromRule(source) : createAutomationValues(initialFamilies),
  });
  const [disableSource, setDisableSource] = useState(Boolean(source?.enabled));
  const followers = source ? downstreamRules(catalog.rules, source) : [];
  return (
    <Dialog
      title={source ? automationText.copyRuleTitle(source.name) : text.newAutomationRule}
      onClose={onClose}
      dismissible={!form.pending}
      size="wide"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((rule) => {
            if (rule) onSaved({ rule, disableSource: Boolean(source?.enabled) && disableSource });
          });
        }}
      >
        {source && <p className="muted">{automationText.copyRuleHint}</p>}
        <fieldset disabled={form.pending}>
          <AutomationRuleFields
            values={form.values}
            catalog={catalog}
            onChange={form.changeValues}
          />
          {source?.enabled && (
            <div className="field">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={disableSource}
                  onChange={(event) => setDisableSource(event.target.checked)}
                />
                {automationText.disableSourceRule(source.name)}
              </label>
              <p className="field-hint">{automationText.disableSourceRuleHint}</p>
              {disableSource && followers.length > 0 && (
                <p className="notice" role="status">
                  {automationText.downstreamFollowsSource(followers.map((rule) => rule.name))}
                </p>
              )}
            </div>
          )}
        </fieldset>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" disabled={form.pending} onClick={onClose}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={form.pending}>
            {form.pending ? text.loading : text.create}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
