import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import {
  useWorkflowActions,
  useWorkflowDetail,
  useWorkflowExecution,
  useWorkflowHistory,
} from '../hooks/useWorkflows';
import { PageHeader } from '../components/PageHeader';
import { Resource, ErrorNotice, Empty } from '../components/Feedback';
import { ChoiceField } from '../components/ChoiceField';
import { WorkflowDialog } from '../dialogs/WorkflowDialog';
import { WorkflowVersionDetails } from '../components/workflows/WorkflowVersionDetails';
import { WorkflowExecutionPanel } from '../components/workflows/WorkflowExecutionPanel';
import { WorkflowComparison } from '../components/workflows/WorkflowComparison';
import { canControlJob } from '../lib/permissions';
import { formatDate } from '../lib/format';
import { workflowsText as labels } from '../i18n/workflows';
import { workflowStatusLabel } from '../lib/workflowLabels';
import { useLocale } from '../i18n/useLocale';

export function WorkflowDetailPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const { user } = useAuth();
  const { workflowId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState<number>();
  const [comparedId, setComparedId] = useState('');
  const detail = useWorkflowDetail(project.id, workflowId);
  const history = useWorkflowHistory(project.id, workflowId);
  const executionId = params.get('execution') ?? history.value?.items[0]?.id ?? '';
  const execution = useWorkflowExecution(project.id, executionId);
  const compared = useWorkflowExecution(project.id, comparedId);
  const actions = useWorkflowActions(project.id, workflowId, (id) => {
    setParams({ execution: id });
    history.reload();
  });
  const current = execution.value;
  const canCancel = current && canControlJob(project.role, user.id, current);
  return (
    <section className="page workflow-detail-page">
      <Resource query={detail}>
        {({ workflow, versions }) => {
          const version = versions.find((item) => item.revision === revision) ?? versions[0]!;
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
                <ChoiceField
                  label={labels.workflowVersion}
                  value={String(version.revision)}
                  options={versions.map((item) => ({
                    value: String(item.revision),
                    label: `v${item.revision}`,
                  }))}
                  onChange={(value) => setRevision(Number(value))}
                />
                {canEdit && (
                  <button
                    className="button primary"
                    disabled={actions.pending}
                    onClick={() => void actions.start(version.revision)}
                  >
                    {labels.workflowStart}
                  </button>
                )}
              </div>
              <WorkflowVersionDetails version={version} />
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
      <ErrorNotice message={actions.error} />
      <h2>{labels.workflowHistory}</h2>
      <Resource query={history}>
        {(page) => (
          <>
            {page.items.length > 0 ? (
              <div className="workflow-toolbar">
                <ChoiceField
                  label={labels.workflowExecution}
                  value={executionId}
                  onChange={(id) => setParams({ execution: id })}
                  options={page.items.map((item) => ({
                    value: item.id,
                    label: `${formatDate(item.createdAt)} · v${item.revision} · ${workflowStatusLabel(item.status)} · ${item.id.slice(0, 8)}`,
                  }))}
                />
                <ChoiceField
                  label={labels.workflowCompare}
                  value={comparedId}
                  onChange={setComparedId}
                  options={[
                    { value: '', label: labels.workflowNoComparison },
                    ...page.items
                      .filter((item) => item.id !== executionId)
                      .map((item) => ({
                        value: item.id,
                        label: `${formatDate(item.createdAt)} · ${item.id.slice(0, 8)}`,
                      })),
                  ]}
                />
              </div>
            ) : (
              <Empty>{labels.workflowNoExecutions}</Empty>
            )}
            <div className="section-actions">
              {history.cursor && (
                <button className="button small" onClick={() => history.setCursor(undefined)}>
                  {labels.workflowFirstPage}
                </button>
              )}
              {page.nextCursor && (
                <button
                  className="button small"
                  onClick={() => history.setCursor(page.nextCursor ?? undefined)}
                >
                  {labels.workflowNextPage}
                </button>
              )}
            </div>
          </>
        )}
      </Resource>
      {current && (
        <>
          <div className="section-actions">
            {canEdit && (current.status === 'failed' || current.status === 'canceled') && (
              <button
                className="button"
                disabled={actions.pending}
                title={labels.workflowResumeHint}
                onClick={() => void actions.start(current.revision, current.id)}
              >
                {labels.workflowResume}
              </button>
            )}
            {canCancel && current.status === 'running' && (
              <button
                className="button danger"
                disabled={actions.pending}
                onClick={() =>
                  void actions.cancel(current.id).then(() => {
                    execution.reload();
                    history.reload();
                  })
                }
              >
                {labels.workflowCancel}
              </button>
            )}
          </div>
        </>
      )}
      {executionId && (
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
