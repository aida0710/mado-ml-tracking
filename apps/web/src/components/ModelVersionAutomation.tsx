import type { ModelAutomationExecutionPage, ModelAutomationRule } from '@mmt/contracts';
import type { QueryState } from '../hooks/useQuery';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { canManageAutomationRules } from '../lib/automationPermissions';
import { AutomationExecutionsTable } from './AutomationExecutionsTable';
import { Resource } from './Feedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 1つのバージョンの自動実行の実行履歴。ルール、種類、登録の結果、RunとJobの状態、所要時間、
 * ルールが失敗したかスキップされた理由。処理が進んでいる間は呼び出し側がポーリングする。
 * Project adminは行からルールをもう一度実行できる。
 */
export function ModelVersionAutomation({
  projectId,
  executions,
  rules,
}: {
  projectId: string;
  executions: QueryState<ModelAutomationExecutionPage>;
  rules: ModelAutomationRule[];
}) {
  useLocale();
  const { project } = useProject();
  const { user } = useAuth();
  const canRerun = canManageAutomationRules(project.role, user.isAdmin);
  return (
    <section className="model-version-section" aria-label={text.modelVersionAutomation}>
      <div className="section-heading">
        <h2>{text.modelVersionAutomation}</h2>
      </div>
      <Resource query={executions}>
        {(page) => (
          <>
            {page.items.length ? (
              <AutomationExecutionsTable
                executions={page.items}
                rules={rules}
                projectId={projectId}
                variant="version"
                onRerun={canRerun ? executions.reload : undefined}
              />
            ) : (
              <p className="muted">{text.modelVersionNoExecutions}</p>
            )}
            {page.nextCursor && <p className="muted">{text.modelVersionAutomationTruncated}</p>}
          </>
        )}
      </Resource>
    </section>
  );
}
