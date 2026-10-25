import type { JobListItem } from '@mmt/contracts';
import { StatusBadge } from './StatusBadge';
import { isJobUnresponsive } from '../lib/jobLiveness';
import { jobDetailBadge } from '../lib/jobDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Jobの状態と、siteが加える情報。待っている間はそのphase（手動の投入、スケジューラーのキュー、
 * GPU）、終わったらその理由（時間の上限、キューの上限、投入の失敗）。
 */
export function JobStatusBadges({
  job,
}: {
  job: Pick<
    JobListItem,
    'status' | 'phase' | 'endReason' | 'heartbeatStale' | 'cancelRequested' | 'sweepEarlyStopped'
  >;
}) {
  useLocale();
  const detail = jobDetailBadge(job);
  return (
    <span className="badge-group">
      <StatusBadge status={job.status} earlyStopped={job.sweepEarlyStopped} />
      {detail && <span className={`status-badge ${detail.className}`}>{detail.label}</span>}
      {isJobUnresponsive(job) && (
        // 応答の無いworkerは赤い状態の色で示す。Jobの状態そのものは変えない。
        <span className="status-badge status-danger" title={text.jobUnresponsiveHint}>
          {text.jobUnresponsive}
        </span>
      )}
      {job.cancelRequested && !job.sweepEarlyStopped && <small>{text.cancelRequested}</small>}
    </span>
  );
}
