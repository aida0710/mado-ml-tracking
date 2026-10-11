import type { ReactNode } from 'react';
import type { ComputeTargetDetails, User } from '@mmt/contracts';
import { ComputeTargetKind } from './ComputeTargetKind';
import { CopyableValue } from './CopyableValue';
import { DetailsList } from './JsonDetails';
import { SiteComputerDetails } from './SiteComputerDetails';
import { TargetCheckPanel } from './TargetCheckPanel';
import { WorkerSetupGuide } from './WorkerSetupGuide';
import { formatTargetGpus, formatTargetLocation } from '../lib/computeTargetDisplay';
import { canManageTarget } from '../lib/permissions';
import { text, textTemplates } from '../i18n/catalog';
import { runtimeLabels } from '../i18n/runtime';

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
  if (target.executor === 'site')
    return <SiteComputerDetails target={target} user={user} onTargetChanged={onTargetChanged} />;
  const canManage = canManageTarget(user, target);
  // In place of the worker setup, those who may not manage the computer read who sets it up.
  const workerSetUpByEntry: Array<[string, ReactNode]> = canManage
    ? []
    : [
        [
          text.workerSetupTitle,
          <span data-testid="worker-set-up-by">
            {textTemplates.workerSetUpBy(target.ownerUserId ? target.ownerName : null)}
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
            [text.runtimeKinds, target.runtimeKinds.map((kind) => runtimeLabels[kind]).join(', ')],
            [text.gpuIds, formatTargetGpus(target)],
            [text.maxConcurrentJobs, String(target.maxConcurrentJobs)],
            ...workerSetUpByEntry,
          ]}
        />
      </section>
      {canManage && (
        <>
          <TargetCheckPanel target={target} onTargetSaved={onTargetChanged} />
          <WorkerSetupGuide targetId={target.id} />
        </>
      )}
    </>
  );
}
