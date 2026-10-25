import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ComputeTarget, Hook, JobListItem } from '@mmt/contracts';
import { DetailsList } from './JsonDetails';
import { JobStatusBadges } from './JobStatusBadges';
import { SiteJobShellVersion } from './SiteJobShellVersion';
import { formatClockDuration } from '../lib/clockDuration';
import { formatDate, formatDateTimeSeconds } from '../lib/format';
import {
  formatAutoRetries,
  jobArrayMemberLabel,
  jobGpuSummary,
  jobPhaseText,
} from '../lib/jobDisplay';
import { isSiteTarget } from '../lib/siteExecutionInput';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobEndReasonLabels } from '../i18n/jobs';

type Entry = [string, ReactNode];

/** Jobのsiteの項目。ssh/localのJobにはどれも無い。 */
function siteEntries(job: JobListItem): Entry[] {
  return [
    [text.jobPhase, jobPhaseText(job, true)],
    [text.walltimeShort, formatClockDuration(job.walltimeSeconds) || text.walltimeUnset],
    [text.schedulerJobId, job.schedulerJobId && <span className="mono">{job.schedulerJobId}</span>],
    [text.jobSubmittedAt, job.submittedAt && formatDate(job.submittedAt)],
    [text.runnerHost, job.runnerHost && <span className="mono">{job.runnerHost}</span>],
    [
      text.jobSiteJobShell,
      job.siteJobShellId && (
        <SiteJobShellVersion targetId={job.targetId} jobShellId={job.siteJobShellId} />
      ),
    ],
    [text.jobAutoRetry, formatAutoRetries(job)],
  ];
}

/** Jobの出どころ。array、親Job（ドライバー）、フック、連鎖の深さ。 */
function originEntries({
  job,
  hooks,
  projectId,
  onSelectJob,
  onSelectArray,
}: {
  job: JobListItem;
  hooks: Hook[];
  projectId: string;
  onSelectJob: (jobId: string) => void;
  onSelectArray: (arrayGroupId: string) => void;
}): Entry[] {
  const entries: Entry[] = [];
  const arrayMember = jobArrayMemberLabel(job);
  const { arrayGroupId, parentJobId, hookId } = job;
  if (arrayGroupId && arrayMember)
    entries.push([
      text.jobArray,
      <button className="link-button" title={arrayGroupId} onClick={() => onSelectArray(arrayGroupId)}>
        <span className="mono">{arrayMember}</span> · {text.jobArrayShowJobs}
      </button>,
    ]);
  if (parentJobId)
    entries.push([
      text.parentJob,
      <button className="link-button mono" onClick={() => onSelectJob(parentJobId)}>
        {parentJobId}
      </button>,
    ]);
  if (hookId)
    entries.push([
      text.jobHook,
      <Link to={`/projects/${projectId}/hooks?hook=${hookId}`}>
        {hooks.find((hook) => hook.id === hookId)?.name ?? hookId}
      </Link>,
    ]);
  if (job.chainDepth > 0) entries.push([text.jobChainDepth, job.chainDepth]);
  if (job.allowChildJobs) entries.push([text.jobAllowChildJobs, text.enabled]);
  return entries;
}

/** Jobsの画面で選んだJobの項目。 */
export function JobDetailsList({
  job,
  target,
  hooks,
  projectId,
  onSelectJob,
  onSelectArray,
}: {
  job: JobListItem;
  target: ComputeTarget | undefined;
  hooks: Hook[];
  projectId: string;
  onSelectJob: (jobId: string) => void;
  onSelectArray: (arrayGroupId: string) => void;
}) {
  useLocale();
  return (
    <DetailsList
      entries={[
        [text.jobColumn, <span className="mono">{job.id}</span>],
        [text.status, <JobStatusBadges job={job} />],
        ...(job.endReason
          ? ([[text.jobEndReason, jobEndReasonLabels[job.endReason]]] satisfies Entry[])
          : []),
        [text.gpuIds, <span className="mono">{jobGpuSummary(job)}</span>],
        // コンピュータを読み込む前でも、phaseがあればsiteのJobだと分かる。
        ...(isSiteTarget(target) || Boolean(job.phase) ? siteEntries(job) : []),
        ...originEntries({ job, hooks, projectId, onSelectJob, onSelectArray }),
        [text.heartbeat, formatDateTimeSeconds(job.heartbeatAt)],
        [text.exitCode, job.exitCode],
        [text.jobError, job.error],
      ]}
    />
  );
}
