import type { Sweep } from '@mmt/contracts';
import { tasksApi } from '../../api/tasks';
import { useProjectTargets } from '../../hooks/useProjectTargets';
import { useProjectWorkers } from '../../hooks/useProjectWorkers';
import { useQuery } from '../../hooks/useQuery';
import { WorkerMissingNotice } from '../WorkerCoverage';
import { isSweepActive } from '../../lib/sweepTrials';
import { jobWorkerCoverage } from '../../lib/workerCoverage';
import { workerCoverageText } from '../../i18n/workerCoverage';

/**
 * A running Sweep whose trials wait on a computer no worker takes: said on the Sweep, since its
 * state stays "running" and its trials "queued" without telling why.
 */
export function SweepWorkerNotice({ projectId, sweep }: { projectId: string; sweep: Sweep }) {
  // Workers are read (and polled) only while trials wait.
  if (!isSweepActive(sweep) || sweep.trialCounts.queued === 0) return null;
  return <WaitingTrialsWorkerNotice projectId={projectId} sweep={sweep} />;
}

function WaitingTrialsWorkerNotice({ projectId, sweep }: { projectId: string; sweep: Sweep }) {
  const tasks = useQuery(`${projectId}:sweep-tasks`, (signal) =>
    tasksApi.list(projectId, undefined, signal),
  );
  const targets = useProjectTargets(projectId);
  const workers = useProjectWorkers(projectId);
  if (!workers.value) return null;
  // A Sweep without a computer of its own runs its trials on the Task's.
  const targetId = sweep.targetId ?? tasks.value?.find((task) => task.id === sweep.taskId)?.targetId;
  const target = targets.value?.find((item) => item.id === targetId);
  if (!target) return null;
  return (
    <WorkerMissingNotice
      target={target}
      coverage={jobWorkerCoverage(target, workers.value)}
      consequence={workerCoverageText.sweepTrialsWaitForWorker}
    />
  );
}
