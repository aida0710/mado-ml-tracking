import type { ComputeTargetDetails, User, WorkerPresence } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { WorkerCoverageBadge } from './WorkerCoverage';
import { ComputeTargetKind } from './ComputeTargetKind';
import { ComputeTargetState } from './ComputeTargetState';
import { VisibilityLabel } from './VisibilityLabel';
import { formatTargetGpus, formatTargetLocation } from '../lib/computeTargetDisplay';
import { targetOwnerLabel } from '../lib/siteComputerDisplay';
import { jobWorkerCoverage } from '../lib/workerCoverage';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { runtimeLabels } from '../i18n/runtime';
import { workerCoverageText } from '../i18n/workerCoverage';
import { formatList } from '../i18n/textJoining';

/**
 * The computers one may run Jobs on, for the Project's Compute page: read only, since adding and
 * managing them is in 全体設定 → コンピュータ. Where one is reached shows only for its managers.
 * Beside the state, whether a worker of the Project takes the computer's Jobs: an enabled computer
 * without one takes Jobs that never start.
 */
export function ComputeTargetsTable({
  targets,
  workers,
  user,
}: {
  targets: ComputeTargetDetails[];
  /** The Project's workers; undefined while they load. */
  workers: WorkerPresence[] | undefined;
  user: Pick<User, 'id'>;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={targets}
      rowKey={(target) => target.id}
      empty={text.noComputers}
      columns={[
        { key: 'name', priority: 'primary', header: text.name, render: (target) => target.name },
        {
          key: 'kind',
          priority: 'secondary',
          header: text.computerKind,
          render: (target) => <ComputeTargetKind target={target} />,
        },
        {
          key: 'owner',
          priority: 'secondary',
          header: text.computerOwner,
          render: (target) => targetOwnerLabel(target, user.id),
        },
        {
          key: 'visibility',
          priority: 'secondary',
          header: text.computerVisibility,
          render: (target) => <VisibilityLabel visibility={target.visibility} />,
        },
        {
          key: 'host',
          priority: 'secondary',
          header: text.host,
          className: 'mono',
          render: (target) => formatTargetLocation(target),
        },
        {
          key: 'runtime',
          priority: 'secondary',
          header: text.runtimeKinds,
          render: (target) => formatList(target.runtimeKinds.map((kind) => runtimeLabels[kind])),
        },
        {
          key: 'gpu',
          priority: 'secondary',
          header: text.gpuIds,
          className: 'mono',
          render: (target) => formatTargetGpus(target),
        },
        {
          key: 'concurrent',
          priority: 'secondary',
          header: text.maxConcurrentJobs,
          className: 'mono',
          render: (target) => target.maxConcurrentJobs,
        },
        {
          key: 'state',
          priority: 'primary',
          header: text.status,
          render: (target) => <ComputeTargetState enabled={target.enabled} />,
        },
        {
          key: 'workers',
          priority: 'primary',
          header: workerCoverageText.workerCoverageColumn,
          render: (target) =>
            workers ? <WorkerCoverageBadge coverage={jobWorkerCoverage(target, workers)} /> : '—',
        },
      ]}
    />
  );
}
