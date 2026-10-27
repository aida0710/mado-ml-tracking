import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { WorkflowExecution, WorkflowVersion } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import {
  useOlderWorkflowVersions,
  useWorkflowDetail,
  useWorkflowExecution,
  useWorkflowHistory,
} from '../hooks/useWorkflows';
import { useWorkflowActions } from '../hooks/useWorkflowActions';
import { PageHeader } from '../components/PageHeader';
import { ProjectBreadcrumb } from '../components/ProjectBreadcrumb';
import { Resource, ErrorNotice } from '../components/Feedback';
import { ChoiceField } from '../components/ChoiceField';
import { WorkflowDialog } from '../dialogs/WorkflowDialog';
import { WorkflowLaunchDialog } from '../dialogs/WorkflowLaunchDialog';
import { WorkflowVersionDetails } from '../components/workflows/WorkflowVersionDetails';
import { WorkflowExecutionPanel } from '../components/workflows/WorkflowExecutionPanel';
import { WorkflowExecutionControls } from '../components/workflows/WorkflowExecutionControls';
import { WorkflowHistoryPicker } from '../components/workflows/WorkflowHistoryPicker';
import { WorkflowComparison } from '../components/workflows/WorkflowComparison';
import { canControlWorkflowExecution } from '../lib/permissions';
import { shortId } from '../lib/jobDisplay';
import { WORKFLOW_EXECUTION_PARAM } from '../lib/workflowPath';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/**
 * 確認した開始・再開・停止の結果を、それを行ったボタンの隣に出す。開始ならバージョンの帯、
 * 再開と停止なら表示中の実行。
 */
interface ActionOutcome {
  place: 'version' | 'execution';
  executionId: string;
  describe: () => string;
}

/** ワークフローに付いてきたバージョンと、求めに応じて読んだ古いバージョンを新しい順に並べる。 */
function mergeVersions(newest: WorkflowVersion[], older: WorkflowVersion[]): WorkflowVersion[] {
  const known = new Set(newest.map((version) => version.revision));
  return [...newest, ...older.filter((version) => !known.has(version.revision))];
}

export function WorkflowDetailPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const { user } = useAuth();
  const { workflowId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [revision, setRevision] = useState<number>();
  const [comparedId, setComparedId] = useState('');
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const detail = useWorkflowDetail(project.id, workflowId);
  const olderVersions = useOlderWorkflowVersions(
    project.id,
    workflowId,
    detail.value?.olderVersionsCursor ?? null,
  );
  const history = useWorkflowHistory(project.id, workflowId);
  const shownId = params.get(WORKFLOW_EXECUTION_PARAM) ?? '';
  const newestId = history.cursor === undefined ? history.value?.items[0]?.id : undefined;
  // ?execution=が無ければ最新の実行を見せる。それをアドレスに書き込んでおくと、履歴のページを
  // めくっても新しい実行が来ても、同じ実行を見せ続けられる。
  useEffect(() => {
    if (!shownId && newestId) setParams({ [WORKFLOW_EXECUTION_PARAM]: newestId }, { replace: true });
  }, [shownId, newestId, setParams]);
  const execution = useWorkflowExecution(project.id, shownId);
  const compared = useWorkflowExecution(project.id, comparedId);
  const actions = useWorkflowActions(project.id, workflowId);
  const current = execution.value;
  const showStarted = (started: WorkflowExecution, place: ActionOutcome['place']) => {
    setOutcome({
      place,
      executionId: started.id,
      describe: () =>
        workflowsTextTemplates.workflowStarted(shortId(started.id), started.revision),
    });
    setParams({ [WORKFLOW_EXECUTION_PARAM]: started.id });
    history.setCursor(undefined);
    history.reload();
  };
  return (
    <section className="page workflow-detail-page">
      <Resource query={detail}>
        {({ workflow, versions }) => {
          const choices = mergeVersions(versions, olderVersions.versions);
          const version = choices.find((item) => item.revision === revision) ?? choices[0]!;
          return (
            <>
              <PageHeader
                title={workflow.name}
                eyebrow={<ProjectBreadcrumb parents={[{ to: `/projects/${project.id}/workflows`, label: labels.workflows }]} />}
                description={workflow.description}
                actions={
                  canEdit && (
                    <button className="button" onClick={() => setEditing(true)}>
                      {labels.workflowNewVersion}
                    </button>
                  )
                }
              />
              <div className="workflow-toolbar">
                <div className="workflow-version-choice">
                  <ChoiceField
                    label={labels.workflowVersion}
                    value={String(version.revision)}
                    placeholder={labels.workflowChoose}
                    options={choices.map((item) => ({
                      value: String(item.revision),
                      label: workflowsTextTemplates.workflowVersionLabel(item.revision),
                    }))}
                    onChange={(value) => setRevision(Number(value))}
                  />
                  {olderVersions.hasMore && (
                    <button
                      className="button small"
                      disabled={olderVersions.pending}
                      onClick={olderVersions.loadMore}
                    >
                      {labels.workflowOlderVersions}
                    </button>
                  )}
                </div>
                {canEdit && (
                  <button className="button primary" onClick={() => setLaunching(true)}>
                    {labels.workflowStart}
                  </button>
                )}
              </div>
              <ErrorNotice message={olderVersions.error} />
              {outcome?.place === 'version' && (
                <p className="notice success" role="status">
                  {outcome.describe()}
                </p>
              )}
              <WorkflowVersionDetails version={version} />
              {launching && (
                <WorkflowLaunchDialog
                  kind="start"
                  workflowName={workflow.name}
                  revision={version.revision}
                  launch={actions.launch}
                  onStarted={(started) => {
                    setLaunching(false);
                    showStarted(started, 'version');
                  }}
                  onClose={() => setLaunching(false)}
                />
              )}
              {editing && (
                <WorkflowDialog
                  projectId={project.id}
                  previous={{
                    workflowId,
                    expectedRevision: workflow.latestRevision,
                    steps: version.steps,
                  }}
                  onClose={() => setEditing(false)}
                  onSaved={() => {
                    setEditing(false);
                    setRevision(undefined);
                    detail.reload();
                  }}
                />
              )}
            </>
          );
        }}
      </Resource>
      <h2>{labels.workflowHistory}</h2>
      <Resource query={history}>
        {(page) => (
          <WorkflowHistoryPicker
            page={page}
            isFirstPage={history.cursor === undefined}
            shown={current}
            shownId={shownId}
            compared={compared.value}
            comparedId={comparedId}
            onShow={(id) => setParams({ [WORKFLOW_EXECUTION_PARAM]: id })}
            onCompare={setComparedId}
            onFirstPage={() => history.setCursor(undefined)}
            onNextPage={history.setCursor}
          />
        )}
      </Resource>
      {current && (
        <WorkflowExecutionControls
          projectId={project.id}
          execution={current}
          canEdit={canEdit}
          canControl={canControlWorkflowExecution(project.role, user.id, current)}
          launch={actions.launch}
          cancel={actions.cancel}
          onResumed={(started) => showStarted(started, 'execution')}
          onCanceled={(canceled) => {
            setOutcome({
              place: 'execution',
              executionId: canceled.id,
              describe: () => workflowsTextTemplates.workflowCancelRequested(shortId(canceled.id)),
            });
            execution.reload();
            history.reload();
          }}
        />
      )}
      {outcome?.place === 'execution' && outcome.executionId === shownId && (
        <p className="notice success" role="status">
          {outcome.describe()}
        </p>
      )}
      {shownId && (
        <Resource query={execution}>
          {(item) => <WorkflowExecutionPanel execution={item} />}
        </Resource>
      )}
      {current && comparedId && (
        <Resource query={compared}>
          {(item) => <WorkflowComparison current={current} previous={item} />}
        </Resource>
      )}
    </section>
  );
}
