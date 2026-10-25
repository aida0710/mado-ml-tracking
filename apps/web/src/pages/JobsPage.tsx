import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, RefreshCw, X } from 'lucide-react';
import { TOKEN_PURPOSE_SCOPES } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { hooksApi } from '../api/hooks';
import { trackingApi } from '../api/tracking';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { useProjectTargets } from '../hooks/useProjectTargets';
import { useProjectWorkers } from '../hooks/useProjectWorkers';
import { useRunLogs } from '../hooks/useRunLogs';
import { EXECUTION_POLL_MS, useQuery } from '../hooks/useQuery';
import { PageHeader } from '../components/PageHeader';
import { Resource } from '../components/Feedback';
import { RunLogs } from '../components/RunLogs';
import { RunExecutionSnapshot } from '../components/RunExecutionSnapshot';
import { JobsTable, type JobAction } from '../components/JobsTable';
import { JobArraysTable } from '../components/JobArraysTable';
import { JobDetailsList } from '../components/JobDetailsList';
import { ManualSubmissionNotice, WaitingJobNotice } from '../components/ManualSubmissionNotice';
import { QueuedJobWaitNotice, WorkerlessJobsNotice } from '../components/QueuedJobWaitNotice';
import { ProjectTokenButton } from '../components/ProjectTokenButton';
import { LaunchDialog } from '../dialogs/LaunchDialog';
import { JobActionDialog } from '../dialogs/JobActionDialog';
import { ResumeDialog } from '../dialogs/ResumeDialog';
import { useResumedRunIds } from '../hooks/useResumedRunIds';
import { summarizeJobArrays } from '../lib/jobArrays';
import { isActiveJob, shortId } from '../lib/jobDisplay';
import { canControlJob } from '../lib/permissions';
import { queuedJobWait, workerlessJobGroups } from '../lib/queuedJobWait';
import {
  isWaitingManualSubmission,
  manualSiteOwnership,
  manualSubmissionGroups,
} from '../lib/manualSubmission';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';

const STATUS_FILTERS = ['queued', 'claimed', 'running', 'finished', 'failed', 'canceled'] as const;

export function JobsPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('job') ?? '';
  const statusFilter = params.get('status') ?? '';
  const arrayFilter = params.get('array') ?? '';
  const [showLaunch, setShowLaunch] = useState(false);
  const [jobAction, setJobAction] = useState<{ id: string; type: JobAction } | null>(null);
  const jobs = useQuery({
    key: `${project.id}:jobs`,
    load: (signal) => executionApi.jobs(project.id, signal),
    pollMs: EXECUTION_POLL_MS,
  });
  const targets = useProjectTargets(project.id);
  // 起動元の列に出すフックの名前。無ければ列にはフックのidを出す。
  const hooks = useQuery({ key: `${project.id}:job-hooks`, load: (signal) => hooksApi.list(project.id, signal) });
  const resumedRunIds = useResumedRunIds(project.id, jobs.value);
  const selected = jobs.value?.find((job) => job.id === selectedId);
  // ポーリングのたびに探し直し、ダイアログには今のJobを見せる。
  const jobForAction = jobAction && jobs.value?.find((job) => job.id === jobAction.id);
  const selectedRun = useQuery({ key: selected ? `${project.id}:job-run:${selected.runId}` : null,
    load: (signal) => trackingApi.run(project.id, selected!.runId, signal), pollMs: EXECUTION_POLL_MS });
  const sourceArtifacts = useQuery({ key: selected ? `${project.id}:job-artifacts:${selected.runId}` : null,
    load: (signal) => trackingApi.artifacts(project.id, selected!.runId, signal), pollMs: EXECUTION_POLL_MS });
  const logs = useRunLogs({
    projectId: project.id,
    run: selected && { id: selected.runId },
    enabled: Boolean(selected),
    isLive: Boolean(selected && isActiveJob(selected)),
  });
  // workerを読み込むまでは、どのJobにもworkerがいないとは言わない。
  const workers = useProjectWorkers(project.id);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const shownJobId = useRef<string | null>(null);
  const selectedJobId = selected?.id ?? null;
  // 詳細は一覧の下にあるので、Jobを選ぶ（または?job=つきで来る）と一度だけ詳細を見える位置へ
  // 送り、フォーカスを移す。それを忘れるのは?job=が変わったときだけ。ポーリングの失敗で詳細が
  // 一瞬隠れても、次の成功でスクロールとフォーカスをまた奪ってはいけない。
  useEffect(() => {
    if (shownJobId.current !== selectedId) shownJobId.current = null;
  }, [selectedId]);
  useEffect(() => {
    if (!selectedJobId || shownJobId.current === selectedJobId) return;
    shownJobId.current = selectedJobId;
    detailHeading.current?.scrollIntoView({ block: 'start' });
    detailHeading.current?.focus({ preventScroll: true });
  }, [selectedJobId]);
  const targetItems = targets.value ?? [];
  const selectedTarget = selected && targetItems.find((target) => target.id === selected.targetId);
  const hookItems = hooks.value ?? [];
  const submitTokenButton = (
    <ProjectTokenButton
      label={text.submitSetupIssueToken}
      scopes={TOKEN_PURPOSE_SCOPES.jobSubmission}
    />
  );
  const setParam = (name: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(name, value);
      else next.delete(name);
      return next;
    });
  const selectJob = (jobId: string) => setParam('job', jobId);
  const selectArray = (arrayGroupId: string) => setParam('array', arrayGroupId);
  return (
    <section className="page jobs-page">
      <PageHeader
        title={text.jobs}
        eyebrow={project.name}
        actions={
          <>
            {canEdit && (
              <button className="button primary" onClick={() => setShowLaunch(true)}>
                <Play size={15} />
                {text.launch}
              </button>
            )}
            <button className="icon-button" aria-label={text.refresh} onClick={jobs.reload}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      {jobs.value && (
        <ManualSubmissionNotice
          groups={manualSubmissionGroups(jobs.value, targetItems, user)}
          tokenButton={submitTokenButton}
        />
      )}
      {jobs.value && workers.value && (
        <WorkerlessJobsNotice
          groups={workerlessJobGroups({
            jobs: jobs.value,
            targets: targetItems,
            workers: workers.value,
          })}
        />
      )}
      <label className="chart-selector">
        <span>{text.status}</span>
        <select
          aria-label={text.status}
          value={statusFilter}
          onChange={(event) => setParam('status', event.target.value)}
        >
          <option value="">{text.allStatus}</option>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {text[status]}
            </option>
          ))}
        </select>
      </label>
      <Resource query={jobs}>
        {(items) => {
          const arrays = summarizeJobArrays(items);
          const rows = items.filter(
            (job) =>
              (!statusFilter || job.status === statusFilter) &&
              (!arrayFilter || job.arrayGroupId === arrayFilter),
          );
          return (
            <>
              {arrays.length > 0 && (
                <JobArraysTable
                  arrays={arrays}
                  targets={targetItems}
                  hooks={hookItems}
                  projectId={project.id}
                  selectedArrayId={arrayFilter}
                  onSelectArray={selectArray}
                  onSelectJob={selectJob}
                />
              )}
              {arrayFilter && (
                <p className="notice">
                  <span>{jobsTextTemplates.jobArrayFilter(shortId(arrayFilter))}</span>
                  <button className="button small" onClick={() => setParam('array', '')}>
                    {text.jobArrayShowAll}
                  </button>
                </p>
              )}
              <JobsTable
                jobs={rows}
                targets={targetItems}
                hooks={hookItems}
                projectId={project.id}
                selectedId={selectedId}
                canControl={(job) => canControlJob(project.role, user.id, job)}
                resumedRunIds={resumedRunIds.value}
                onSelectJob={selectJob}
                onSelectArray={selectArray}
                onAction={(id, type) => setJobAction({ id, type })}
              />
            </>
          );
        }}
      </Resource>
      {selected && (
        <section className="job-detail" aria-labelledby="job-detail-heading">
          <div className="job-detail-heading">
            <h2 id="job-detail-heading" ref={detailHeading} tabIndex={-1}>
              {selected.runName}
            </h2>
            <button type="button" className="button small" onClick={() => setParam('job', '')}>
              <X size={14} />
              {text.jobDetailClose}
            </button>
          </div>
          {workers.value && (
            <QueuedJobWaitNotice
              wait={queuedJobWait(selected, selectedTarget, workers.value)}
              target={selectedTarget}
            />
          )}
          <JobDetailsList
            job={selected}
            target={selectedTarget}
            hooks={hookItems}
            projectId={project.id}
            onSelectJob={selectJob}
            onSelectArray={selectArray}
          />
          {isWaitingManualSubmission(selected) && (
            <WaitingJobNotice
              targetId={selected.targetId}
              ownership={manualSiteOwnership(selectedTarget, user)}
              isRequester={selectedRun.value?.createdBy === user.id}
              tokenButton={submitTokenButton}
            />
          )}
          {/* ログは長い実行snapshotより前に置く。失敗したJobを開くのはログを見るためだから。 */}
          <h3>{text.logs}</h3>
          <RunLogs logs={logs} />
          <Resource query={selectedRun}>
            {(run) => (
              <Resource query={sourceArtifacts}>
                {(artifacts) => (
                  <RunExecutionSnapshot run={run} artifacts={artifacts} taskName={selected.taskName} />
                )}
              </Resource>
            )}
          </Resource>
        </section>
      )}
      {showLaunch && (
        <LaunchDialog
          onClose={() => setShowLaunch(false)}
          onSaved={(job) => {
            setShowLaunch(false);
            jobs.reload();
            setParams({ job: job.id });
          }}
        />
      )}
      {jobAction?.type === 'resumeLatest' && (
        <ResumeDialog
          projectId={project.id}
          jobId={jobAction.id}
          onClose={() => setJobAction(null)}
        />
      )}
      {jobForAction && (jobAction.type === 'cancel' || jobAction.type === 'retry') && (
        <JobActionDialog
          projectId={project.id}
          job={jobForAction}
          targetName={
            targetItems.find((target) => target.id === jobForAction.targetId)?.name ??
            jobForAction.targetId
          }
          action={jobAction.type}
          onClose={() => setJobAction(null)}
          onDone={(retryRunId) => {
            setJobAction(null);
            jobs.reload();
            if (retryRunId) navigate(`/projects/${project.id}/runs/${retryRunId}`);
          }}
        />
      )}
    </section>
  );
}
