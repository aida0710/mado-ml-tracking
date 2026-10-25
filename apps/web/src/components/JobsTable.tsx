import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { ComputeTarget, Hook, JobListItem } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { JobStatusBadges } from './JobStatusBadges';
import { isResumableStatus } from '../lib/checkpointResume';
import { isResumableWorkflowStepJob } from '../lib/workflowExecutionState';
import { workflowPath } from '../lib/workflowPath';
import { formatDate } from '../lib/format';
import {
  isActiveJob,
  jobArrayMemberLabel,
  jobAttemptLabel,
  jobGpuSummary,
  shortId,
} from '../lib/jobDisplay';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';
import { useComputerNames } from '../hooks/useComputerNames';

export type JobAction = 'cancel' | 'retry' | 'resumeLatest';

/** siteのJobが動く場所。報告されたら、runnerのホストとスケジューラーのjob IDを示す。 */
function JobLocation({ job }: { job: Pick<JobListItem, 'runnerHost' | 'schedulerJobId'> }) {
  useLocale();
  if (!job.runnerHost && !job.schedulerJobId) return <>—</>;
  return (
    <span className="job-cell-lines">
      {job.runnerHost && <span className="mono">{job.runnerHost}</span>}
      {job.schedulerJobId && (
        <span title={text.schedulerJobId}>
          <small className="muted">{text.schedulerJobIdShort} </small>
          <span className="mono">{job.schedulerJobId}</span>
        </span>
      )}
    </span>
  );
}

/**
 * 人のほかにJobを始めたもの。Sweepの試行、自動実行ルール、フック、ドライバーのJob（親Job）、
 * またはJobが属するarray。
 */
function JobOrigin({
  job,
  projectId,
  hooks,
  onSelectJob,
  onSelectArray,
}: {
  job: JobListItem;
  projectId: string;
  hooks: Hook[];
  onSelectJob: (jobId: string) => void;
  onSelectArray: (arrayGroupId: string) => void;
}) {
  useLocale();
  const arrayMember = jobArrayMemberLabel(job);
  const { hookId, parentJobId, arrayGroupId, sweepTrial, automationRule } = job;
  if (!hookId && !parentJobId && !(arrayGroupId && arrayMember) && !sweepTrial && !automationRule)
    return <>—</>;
  return (
    <span className="job-cell-lines">
      {sweepTrial && (
        <Link to={`/projects/${projectId}/sweeps/${sweepTrial.sweepId}`}>
          {jobsTextTemplates.jobSweepTrialOrigin(sweepTrial.sweepName, sweepTrial.trialIndex)}
        </Link>
      )}
      {automationRule && (
        <span title={automationRule.ruleId}>
          {jobsTextTemplates.jobAutomationOrigin(automationRule.ruleName)}
        </span>
      )}
      {hookId && (
        <Link to={`/projects/${projectId}/hooks?hook=${hookId}`} title={hookId}>
          {text.jobHook}: {hooks.find((hook) => hook.id === hookId)?.name ?? shortId(hookId)}
        </Link>
      )}
      {parentJobId && (
        <button className="link-button" title={parentJobId} onClick={() => onSelectJob(parentJobId)}>
          {text.parentJob}: <span className="mono">{shortId(parentJobId)}</span>
        </button>
      )}
      {arrayGroupId && arrayMember && (
        <button className="link-button" title={arrayGroupId} onClick={() => onSelectArray(arrayGroupId)}>
          {text.jobArray} <span className="mono">{arrayMember}</span>
        </button>
      )}
    </span>
  );
}

/**
 * ProjectのJob。siteのJobは、状態にphaseか終了の理由を添え、動く場所（runnerのホスト、
 * スケジューラーのjob ID）と、始めたもの（フック、親Job、array）も示す。
 */
export function JobsTable({
  jobs,
  targets,
  hooks,
  projectId,
  selectedId,
  canControl,
  resumedRunIds,
  onSelectJob,
  onSelectArray,
  onAction,
}: {
  jobs: JobListItem[];
  targets: ComputeTarget[];
  hooks: Hook[];
  projectId: string;
  selectedId: string;
  /** ログイン中の利用者がJobを停止・再実行できるか（lib/permissionsのcanControlJob）。 */
  canControl: (job: JobListItem) => boolean;
  resumedRunIds: ReadonlySet<string> | undefined;
  onSelectJob: (jobId: string) => void;
  onSelectArray: (arrayGroupId: string) => void;
  onAction: (jobId: string, action: JobAction) => void;
}) {
  useLocale();
  const computerName = useComputerNames(targets);
  return (
    <ResponsiveTable
      rows={jobs}
      rowKey={(job) => job.id}
      selectedKey={selectedId}
      columns={[
        {
          key: 'id',
          priority: 'primary',
          header: text.jobColumn,
          render: (job) => (
            <button className="link-button mono" title={job.id} onClick={() => onSelectJob(job.id)}>
              {shortId(job.id)}
            </button>
          ),
        },
        {
          key: 'status',
          priority: 'primary',
          header: text.status,
          render: (job) => <JobStatusBadges job={job} />,
        },
        {
          key: 'run',
          priority: 'primary',
          header: text.jobRunColumn,
          className: 'job-run-cell',
          render: (job) => (
            <>
              <Link to={`/projects/${projectId}/runs/${job.runId}`} title={job.runId}>
                {job.runName}
              </Link>
              <small className="muted"> {text[job.runKind]}</small>
              {resumedRunIds?.has(job.runId) && (
                <span
                  className="status-badge status-info resumed-run-badge"
                  title={text.checkpointResumedBadgeHint}
                >
                  {text.checkpointResumedBadge}
                </span>
              )}
            </>
          ),
        },
        {
          key: 'createdBy',
          priority: 'secondary',
          header: text.jobCreatedBy,
          render: (job) => job.createdByName ?? shortId(job.createdBy),
        },
        {
          key: 'task',
          priority: 'secondary',
          header: text.task,
          render: (job) =>
            job.taskId ? (
              <Link to={`/projects/${projectId}/tasks?id=${job.taskId}`}>
                {job.taskName ?? shortId(job.taskId)}
              </Link>
            ) : (
              '—'
            ),
        },
        {
          key: 'target',
          priority: 'secondary',
          header: text.target,
          render: (job) => computerName(job.targetId),
        },
        {
          key: 'gpu',
          priority: 'secondary',
          header: text.gpuIds,
          className: 'mono nowrap',
          render: (job) => jobGpuSummary(job),
        },
        {
          key: 'where',
          priority: 'secondary',
          header: text.jobWhere,
          render: (job) => <JobLocation job={job} />,
        },
        {
          key: 'origin',
          priority: 'secondary',
          header: text.jobOrigin,
          render: (job) => (
            <JobOrigin
              job={job}
              projectId={projectId}
              hooks={hooks}
              onSelectJob={onSelectJob}
              onSelectArray={onSelectArray}
            />
          ),
        },
        {
          key: 'attempt',
          priority: 'secondary',
          header: text.attempt,
          className: 'mono nowrap',
          render: (job) => jobAttemptLabel(job),
        },
        {
          key: 'created',
          priority: 'secondary',
          header: text.created,
          render: (job) => formatDate(job.createdAt),
        },
        {
          key: 'actions',
          priority: 'secondary',
          header: text.jobActions,
          render: (job) =>
            // ツールチップでなく文で示し、タッチやキーボードでも理由が読めるようにする。
            !canControl(job) ? (
              <small className="muted job-control-reason">{text.jobControlOwnerOnly}</small>
            ) : isActiveJob(job) ? (
              <button
                className="button small"
                disabled={job.cancelRequested}
                onClick={() => onAction(job.id, 'cancel')}
              >
                {text.cancelJob}
              </button>
            ) : job.workflowExecution ? (
              // ワークフローのステップは、その実行を再開してやり直す（Jobそのものの再実行は
              // 断られる）。そのためJobからはワークフローへ案内する。失敗か取り消しなら再開へ、
              // そうでなければ開くだけ。
              <Link className="button small" to={workflowPath(projectId, job.workflowExecution)}>
                {isResumableWorkflowStepJob(job) ? text.workflowResumeFromJob : text.workflowOpen}
              </Link>
            ) : (
              <span className="job-row-actions">
                <button className="button small" onClick={() => onAction(job.id, 'retry')}>
                  {text.retryJob}
                </button>
                {isResumableStatus(job.status) &&
                  job.hasResumeCheckpoint &&
                  !job.sweepEarlyStopped && (
                    <button
                      className="button small"
                      onClick={() => onAction(job.id, 'resumeLatest')}
                    >
                      {text.checkpointResumeLatest}
                    </button>
                  )}
              </span>
            ),
        },
      ]}
    />
  );
}
