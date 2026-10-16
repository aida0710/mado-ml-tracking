import type { ReactNode } from 'react';
import type { ComputeTargetDetails, User } from '@mmt/contracts';
import { ComputeTargetKind } from './ComputeTargetKind';
import { CopyableValue } from './CopyableValue';
import { DetailsList } from './JsonDetails';
import { SiteComputerDetails } from './SiteComputerDetails';
import { TargetCheckPanel } from './TargetCheckPanel';
import { WorkerSetupGuide } from './WorkerSetupGuide';
import { WorkerCoverageBadge } from './WorkerCoverage';
import { useAllWorkers } from '../hooks/useAllWorkers';
import { formatTargetGpus, formatTargetLocation } from '../lib/computeTargetDisplay';
import { canManageTarget, isGlobalAdmin } from '../lib/permissions';
import { checkWorkerCoverage, jobWorkerCoverage } from '../lib/workerCoverage';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { runtimeLabels } from '../i18n/runtime';
import { workerCoverageText } from '../i18n/workerCoverage';
import { formatList } from '../i18n/textJoining';

/**
 * A computer's details below 全体設定 → コンピュータ, for those who may use or manage it: a site's
 * job shell, settings and submission; an ssh or local target's description with its ID. Setting the
 * computer up is for its owner and global administrators, so only they get its connection check and
 * how to run the worker that takes its Jobs; everyone else is told who sets the worker up.
 */
export function ComputerDetails({
  target,
  user,
  onTargetChanged,
}: {
  target: ComputeTargetDetails;
  user: Pick<User, 'id' | 'isAdmin'>;
  onTargetChanged: () => void;
}) {
  useLocale();
  // Only global administrators list every Project's workers; others read who runs the worker.
  const workers = useAllWorkers(target.executor !== 'site' && isGlobalAdmin(user));
  if (target.executor === 'site')
    return <SiteComputerDetails target={target} user={user} onTargetChanged={onTargetChanged} />;
  const canManage = canManageTarget(user, target);
  // Every Project's workers: one of them answering does not mean this Project's Jobs start.
  const workerEntry: Array<[string, ReactNode]> = workers.value
    ? [
        [
          workerCoverageText.workerCoverageAnyProject,
          <>
            <WorkerCoverageBadge coverage={jobWorkerCoverage(target, workers.value)} />{' '}
            <span className="muted">{workerCoverageText.workerCoverageAnyProjectHint}</span>
          </>,
        ],
      ]
    : [];
  // In place of the worker setup, those who may not manage the computer read who sets it up.
  const workerSetUpByEntry: Array<[string, ReactNode]> = canManage
    ? []
    : [
        [
          text.workerSetupTitle,
          <span data-testid="worker-set-up-by">
            {textTemplates.workerSetUpBy(target.ownerName ?? target.ownerUserId)}
          </span>,
        ],
      ];
  return (
    <>
      <section className="settings-section" data-testid="computer-summary">
        <div className="section-heading">
          <h2>{target.name}</h2>
        </div>
        <DetailsList
          entries={[
            [text.computerId, <CopyableValue value={target.id} />],
            [text.computerKind, <ComputeTargetKind target={target} />],
            [text.computerLocation, <span className="mono">{formatTargetLocation(target)}</span>],
            [text.runtimeKinds, formatList(target.runtimeKinds.map((kind) => runtimeLabels[kind]))],
            [text.gpuIds, formatTargetGpus(target)],
            [text.maxConcurrentJobs, String(target.maxConcurrentJobs)],
            ...workerEntry,
            ...workerSetUpByEntry,
          ]}
        />
      </section>
      {canManage && (
        <>
          <TargetCheckPanel
            target={target}
            checkCoverage={workers.value && checkWorkerCoverage(target, workers.value)}
            onTargetSaved={onTargetChanged}
          />
          <WorkerSetupGuide targetId={target.id} />
        </>
      )}
    </>
  );
}
