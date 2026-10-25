import type { ComputeTarget, WorkerPresence } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { formatList } from '../i18n/textJoining';

// Reuses the Job status colors: finished is the green badge and failed the red one.
const workerStatusBadgeClass: Record<WorkerPresence['status'], string> = {
  online: 'status-success',
  offline: 'status-danger',
};

function WorkerStatusBadge({ status }: { status: WorkerPresence['status'] }) {
  useLocale();
  return (
    <span
      className={`status-badge ${workerStatusBadgeClass[status]}`}
      title={status === 'offline' ? text.workerOfflineHint : undefined}
    >
      <span aria-hidden="true">●</span>
      {status === 'online' ? text.workerOnline : text.workerOffline}
    </span>
  );
}

export function WorkerPresenceTable({
  workers,
  targets,
}: {
  workers: WorkerPresence[];
  targets: ComputeTarget[];
}) {
  useLocale();
  const targetName = (id: string) => targets.find((target) => target.id === id)?.name ?? id;
  return (
    <ResponsiveTable
      rows={workers}
      rowKey={(worker) => `${worker.tokenId}:${worker.workerId}`}
      empty={text.noWorkers}
      columns={[
        {
          key: 'worker',
          priority: 'primary',
          header: text.workerId,
          className: 'mono',
          render: (worker) => worker.workerId,
        },
        {
          key: 'status',
          priority: 'primary',
          header: text.workerStatus,
          render: (worker) => <WorkerStatusBadge status={worker.status} />,
        },
        {
          key: 'version',
          priority: 'secondary',
          header: text.workerVersion,
          className: 'mono',
          render: (worker) => worker.version,
        },
        {
          key: 'hostname',
          priority: 'secondary',
          header: text.workerHostname,
          render: (worker) => worker.hostname,
        },
        {
          key: 'token',
          priority: 'secondary',
          header: text.workerToken,
          render: (worker) => worker.tokenName,
        },
        {
          key: 'targets',
          priority: 'secondary',
          header: text.workerTargets,
          render: (worker) => (worker.targetIds ? formatList(worker.targetIds.map(targetName)) : text.workerAllTargets),
        },
        {
          key: 'lastSeen',
          priority: 'secondary',
          header: text.workerLastSeen,
          render: (worker) => formatDate(worker.lastSeenAt),
        },
        {
          key: 'activeJobs',
          priority: 'secondary',
          header: text.workerActiveJobs,
          className: 'mono',
          render: (worker) =>
            `${worker.activeJobCount} / ${worker.parallelJobs}`,
        },
      ]}
    />
  );
}
