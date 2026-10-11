import { Plus, RefreshCw } from 'lucide-react';
import type { AutomationExecutionFilter } from '../api/automation';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { useProjectTargets } from '../hooks/useProjectTargets';
import { useModelAutomation } from '../hooks/useModelAutomation';
import { useExecutionCatalog } from '../hooks/useExecutionCatalog';
import { canManageAutomationRules } from '../lib/automationPermissions';
import { AutomationRuleDialog } from '../dialogs/AutomationRuleDialog';
import { AutomationRulesTable } from './AutomationRulesTable';
import { AutomationExecutionsTable } from './AutomationExecutionsTable';
import { AutomationHistoryFilters } from './AutomationHistoryFilters';
import { AutomationRuleDetails } from './AutomationRuleDetails';
import { QueryDialog } from './QueryDialog';
import { Resource, ErrorNotice } from './Feedback';
import { text } from '../i18n/catalog';
import { automationText } from '../i18n/automation';

export function ModelAutomationPanel({
  view,
  initialFamily,
  historyFilter,
  onHistoryFilterChange,
  onShowRuleHistory,
}: {
  view: 'rules' | 'history';
  initialFamily?: string;
  historyFilter: AutomationExecutionFilter;
  onHistoryFilterChange: (filter: AutomationExecutionFilter) => void;
  /** Opens the history tab narrowed to one rule. */
  onShowRuleHistory: (ruleId: string) => void;
}) {
  const { project } = useProject();
  const { user } = useAuth();
  const canManage = canManageAutomationRules(project.role, user.isAdmin);
  const automation = useModelAutomation({
    projectId: project.id,
    showExecutions: view === 'history',
    historyFilter,
  });
  const registry = useExecutionCatalog(project.id);
  const targets = useProjectTargets(project.id);
  const rules = automation.rules.value ?? [];
  const catalog =
    registry.value && targets.value
      ? { registry: registry.value, targets: targets.value, rules }
      : undefined;
  const selectedRule = automation.rules.value?.find(
    (rule) => rule.id === automation.selectedRuleId,
  );
  const { executions, draft } = automation;
  return (
    <section className="automation-panel">
      <div className="section-heading">
        <h2>{view === 'rules' ? text.automationRules : text.automationHistory}</h2>
        <div>
          {canManage && view === 'rules' && (
            <button className="button primary small" onClick={automation.startCreating}>
              <Plus size={15} />
              {text.newAutomationRule}
            </button>
          )}
          <button
            className="icon-button"
            aria-label={text.refresh}
            onClick={() => {
              automation.reload();
              registry.reload();
              targets.reload();
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      {!canManage && view === 'rules' && <p className="muted">{automationText.manageAdminOnly}</p>}
      <ErrorNotice message={automation.error} />
      {automation.sourceLeftEnabled && (
        <p className="notice error" role="alert">
          {automationText.sourceRuleLeftEnabled(automation.sourceLeftEnabled)}
        </p>
      )}
      {view === 'history' && (
        <ErrorNotice message={automation.rules.error} retry={automation.rules.reload} />
      )}
      <ErrorNotice message={registry.error} retry={registry.reload} />
      <ErrorNotice message={targets.error} retry={targets.reload} />
      {view === 'rules' ? (
        <>
          <Resource query={automation.rules}>
            {(rules) => (
              <AutomationRulesTable
                rules={rules}
                projectId={project.id}
                catalog={catalog}
                selectedRuleId={automation.selectedRuleId}
                canManage={canManage}
                pending={automation.pending}
                onSelect={automation.selectRule}
                onSetEnabled={(id, enabled) => {
                  void automation.setEnabled(id, enabled);
                }}
              />
            )}
          </Resource>
          {selectedRule && (
            <AutomationRuleDetails
              rule={selectedRule}
              rules={rules}
              catalog={catalog}
              projectId={project.id}
              canManage={canManage}
              pending={automation.pending}
              onSelectRule={automation.selectRule}
              onEnable={() => void automation.setEnabled(selectedRule.id, true)}
              onCopy={() => automation.startCopying(selectedRule)}
              onShowHistory={() => onShowRuleHistory(selectedRule.id)}
              onApplied={automation.reload}
            />
          )}
        </>
      ) : (
        <>
          <AutomationHistoryFilters
            filter={historyFilter}
            rules={rules}
            catalog={registry.value}
            onChange={onHistoryFilterChange}
          />
          <ErrorNotice message={executions.error} retry={executions.reload} />
          {executions.loading ? (
            <p className="muted" role="status">
              {text.loading}
            </p>
          ) : (
            <AutomationExecutionsTable
              executions={executions.items}
              rules={rules}
              projectId={project.id}
              catalog={registry.value}
              onRerun={canManage ? automation.reload : undefined}
            />
          )}
          {executions.hasMore && (
            <div className="section-actions">
              <span className="muted">
                {automationText.historyShownCount(executions.items.length)}
              </span>
              <button
                className="button small"
                disabled={executions.loadingMore}
                onClick={executions.loadMore}
              >
                {executions.loadingMore ? text.loading : automationText.historyLoadMore}
              </button>
            </div>
          )}
        </>
      )}
      {canManage && draft && (
        <QueryDialog title={text.newAutomationRule} onClose={automation.stopCreating} query={registry}>
          {(choices) => (
            <QueryDialog
              title={text.newAutomationRule}
              onClose={automation.stopCreating}
              query={targets}
            >
              {(computeTargets) => (
                <AutomationRuleDialog
                  catalog={{ registry: choices, targets: computeTargets, rules }}
                  initialFamilies={initialFamily ? [initialFamily] : []}
                  source={draft.source}
                  onClose={automation.stopCreating}
                  onSaved={(saved) => void automation.finishCreating(saved)}
                />
              )}
            </QueryDialog>
          )}
        </QueryDialog>
      )}
    </section>
  );
}
