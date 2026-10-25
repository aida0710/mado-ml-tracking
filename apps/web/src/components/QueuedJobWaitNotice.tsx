import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import { WorkerCoverageBadge, WorkerMissingNotice } from './WorkerCoverage';
import { computerDetailsPath } from '../layout/settingsSections';
import type { QueuedJobWait, WorkerlessJobGroup } from '../lib/queuedJobWait';
import {
  workerCapabilityLabels,
  workerCoverageText,
  workerCoverageTextTemplates,
} from '../i18n/workerCoverage';

/**
 * 選んだ待機中のJobが始まっていない理由。そのコンピュータのworkerが無い（とその設定の場所）、Jobに
 * 必要な機能に対してworkerが古い、コンピュータが混んでいる、のいずれか。siteのJobは代わりに詳細で
 * phaseを伝える。
 */
export function QueuedJobWaitNotice({
  wait,
  target,
}: {
  wait: QueuedJobWait | null;
  target: { id: string; name: string } | undefined;
}) {
  useLocale();
  if (!wait || !target) return null;
  if (wait.kind === 'workerUpdate')
    return (
      <div className="notice queued-job-reason" role="status">
        <p>{workerCoverageText.queuedJobNeedsWorkerUpdate}</p>
        <ul>
          {wait.missingCapabilities.map((capability) => (
            <li key={capability}>{workerCapabilityLabels[capability]}</li>
          ))}
        </ul>
        <p className="muted">{workerCoverageText.workerCoverageSetupByOwner}</p>
      </div>
    );
  if (wait.kind === 'notTaken')
    return (
      <div className="notice queued-job-reason" role="status">
        <p>{workerCoverageText.queuedJobNotTaken}</p>
        <ul>
          {workerCoverageText.queuedJobNotTakenReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <WorkerMissingNotice
      target={target}
      coverage={wait.coverage}
      consequence={workerCoverageText.queuedJobWaitsForWorker}
    />
  );
}

/**
 * Jobsの一覧の上に、workerがいないのに待機中のJobがあるコンピュータを示し、始まりようのないJobを
 * だれも待ち続けないようにする。それぞれコンピュータの詳細へリンクする。
 */
export function WorkerlessJobsNotice({ groups }: { groups: WorkerlessJobGroup[] }) {
  useLocale();
  if (!groups.length) return null;
  return (
    <section
      className="notice error worker-missing"
      aria-label={workerCoverageText.workerlessJobsTitle}
    >
      <strong>{workerCoverageText.workerlessJobsTitle}</strong>
      <p>{workerCoverageText.workerlessJobsHint}</p>
      <ul>
        {groups.map((group) => (
          <li key={group.target.id}>
            <span>
              {workerCoverageTextTemplates.workerlessJobsCount(group.target.name, group.waitingJobs)}
            </span>{' '}
            <WorkerCoverageBadge coverage={group.coverage} />{' '}
            <Link to={computerDetailsPath(group.target.id)}>
              {workerCoverageText.workerCoverageSetupLink}
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">{workerCoverageText.workerCoverageSetupByOwner}</p>
    </section>
  );
}
