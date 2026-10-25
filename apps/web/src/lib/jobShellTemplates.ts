import type { ExecutionRuntimeKind, SiteGpuAssignment } from '@mmt/contracts';
// deploy/sitesの例。そのまま読み込み、Webが文書のとおりのものを出すようにする。
import directApptainerJobShell from '../../../../deploy/sites/examples/direct-apptainer/job.sh?raw';
import directDockerJobShell from '../../../../deploy/sites/examples/direct-docker/job.sh?raw';
import fujitsuTcsJobShell from '../../../../deploy/sites/examples/fujitsu-tcs/job.sh?raw';
import gridEngineJobShell from '../../../../deploy/sites/examples/grid-engine/job.sh?raw';
import pbsJobShell from '../../../../deploy/sites/examples/pbs/job.sh?raw';
import slurmJobShell from '../../../../deploy/sites/examples/slurm/job.sh?raw';

export type JobShellTemplateKey =
  | 'pbs'
  | 'slurm'
  | 'grid-engine'
  | 'fujitsu-tcs'
  | 'direct-docker'
  | 'direct-apptainer';

/**
 * siteを作り始めるためのjob shellと、それに合う設定。スケジューラが待ち行列のジョブを外す方法、
 * arrayを1回で投入するか、GPUを誰が選ぶか、計算ノードにあるコンテナのRuntime。
 */
export interface JobShellTemplate {
  key: JobShellTemplateKey;
  content: string;
  cancelCommand: string | null;
  supportsArray: boolean;
  gpuAssignment: SiteGpuAssignment;
  runtimeKinds: ExecutionRuntimeKind[];
}

// 各例のREADMEがWeb向けに挙げる設定。スケジューラの取消コマンド（スケジューラの無いホストには
// ジョブを外す待ち行列が無い）と、バッチスクリプトが読み込むRuntime。
export const JOB_SHELL_TEMPLATES: readonly JobShellTemplate[] = [
  {
    key: 'pbs',
    content: pbsJobShell,
    cancelCommand: 'qdel "$MMT_SCHEDULER_JOB_ID"',
    supportsArray: true,
    gpuAssignment: 'scheduler',
    runtimeKinds: ['singularity'],
  },
  {
    key: 'slurm',
    content: slurmJobShell,
    cancelCommand: 'scancel "$MMT_SCHEDULER_JOB_ID"',
    supportsArray: true,
    gpuAssignment: 'scheduler',
    runtimeKinds: ['apptainer'],
  },
  {
    key: 'grid-engine',
    content: gridEngineJobShell,
    cancelCommand: 'qdel "$MMT_SCHEDULER_JOB_ID"',
    supportsArray: true,
    gpuAssignment: 'scheduler',
    runtimeKinds: ['apptainer'],
  },
  {
    key: 'fujitsu-tcs',
    content: fujitsuTcsJobShell,
    cancelCommand: 'pjdel "$MMT_SCHEDULER_JOB_ID"',
    supportsArray: true,
    gpuAssignment: 'scheduler',
    runtimeKinds: ['singularity'],
  },
  {
    key: 'direct-docker',
    content: directDockerJobShell,
    cancelCommand: null,
    // arrayのJobは1つずつ来て、それぞれ空いたGPUを待つ（examples/direct-docker/README.md）。
    supportsArray: false,
    gpuAssignment: 'lease',
    runtimeKinds: ['docker'],
  },
  {
    key: 'direct-apptainer',
    content: directApptainerJobShell,
    cancelCommand: null,
    supportsArray: false,
    gpuAssignment: 'lease',
    runtimeKinds: ['apptainer'],
  },
];

export function findJobShellTemplate(key: string): JobShellTemplate | undefined {
  return JOB_SHELL_TEMPLATES.find((template) => template.key === key);
}
