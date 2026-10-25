import type { Sweep } from '@mmt/contracts';
import { tasksApi } from '../../api/tasks';
import { useProjectTargets } from '../../hooks/useProjectTargets';
import { useProjectWorkers } from '../../hooks/useProjectWorkers';
import { useQuery } from '../../hooks/useQuery';
import { WorkerMissingNotice } from '../WorkerCoverage';
import { isSweepActive } from '../../lib/sweepTrials';
import { jobWorkerCoverage } from '../../lib/workerCoverage';
import { useLocale } from '../../i18n/useLocale';
import { workerCoverageText } from '../../i18n/workerCoverage';

/**
 * 実行中のSweepの試行が、どのworkerも引き受けないコンピュータで待っていることを伝える。
 * Sweepの状態は"running"、試行は"queued"のままで理由を示さないので、Sweepの上で伝える。
 */
export function SweepWorkerNotice({ projectId, sweep }: { projectId: string; sweep: Sweep }) {
  useLocale();
  // workerを読む（ポーリングする）のは、試行が待っている間だけ。
  if (!isSweepActive(sweep) || sweep.trialCounts.queued === 0) return null;
  return <WaitingTrialsWorkerNotice projectId={projectId} sweep={sweep} />;
}

function WaitingTrialsWorkerNotice({ projectId, sweep }: { projectId: string; sweep: Sweep }) {
  useLocale();
  const tasks = useQuery({ key: `${projectId}:sweep-tasks`, load: (signal) =>
    tasksApi.list(projectId, undefined, signal),
  });
  const targets = useProjectTargets(projectId);
  const workers = useProjectWorkers(projectId);
  if (!workers.value) return null;
  // 自分のコンピュータを持たないSweepは、Taskのコンピュータで試行を動かす。
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
