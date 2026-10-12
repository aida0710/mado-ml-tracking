import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/**
 * What a confirmed start, resume or stop did, said next to the button that did it: the version
 * toolbar for a start, the shown execution for a resume or a stop.
 */
interface ActionOutcome {
  place: 'version' | 'execution';
  executionId: string;
  describe: () => string;
}

/** The versions the workflow came with, then the older ones loaded on request, newest first. */
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
  const shownId = params.get('execution') ?? '';
  const newestId = history.cursor === undefined ? history.value?.items[0]?.id : undefined;
  // Without ?execution= the newest execution is shown. Writing it into the address keeps it shown
  // while the history pages turn and new executions arrive.
  useEffect(() => {
    if (!shownId && newestId) setParams({ execution: newestId }, { replace: true });
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
    setParams({ execution: started.id });
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
                eyebrow={<Link to={`/projects/${project.id}/workflows`}>{labels.workflows}</Link>}
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
                  workflowName={workflow.name}
                  revision={version.revision}
                  resumeFrom={null}
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
            onShow={(id) => setParams({ execution: id })}
            onCompare={setComparedId}
            onFirstPage={() => history.setCursor(undefined)}
            onNextPage={history.setCursor}
          />
        )}
      </Resource>
      {current && (
        <WorkflowExecutionControls
          projectId={project.id}
          workflowName={detail.value?.workflow.name ?? ''}
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
