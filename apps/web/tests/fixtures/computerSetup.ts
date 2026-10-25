import type {
  TargetCheck,
  TargetCheckResultV2,
  TargetCheckWorkerPresence,
  TargetDirectoryListingResult,
} from '@mmt/contracts';

// GPUサーバーの接続確認（version 2）が報告する内容。workerが送る形のまま。
export const setupCheckResult: TargetCheckResultV2 = {
  version: 2,
  items: [
    { name: 'connection', status: 'ok', code: null, detail: null },
    { name: 'python', status: 'ok', code: null, detail: '3.12.3 /usr/bin/python3' },
    { name: 'work_directory', status: 'skipped', code: 'work_directory_not_set', detail: null },
  ],
  gpus: [
    { index: '0', uuid: 'GPU-a', name: 'NVIDIA H100', memoryTotalMiB: 81559 },
    { index: '1', uuid: 'GPU-b', name: 'NVIDIA H100', memoryTotalMiB: 81559 },
  ],
  runtimeKinds: ['python', 'docker'],
  workDirectoryFreeBytes: null,
  host: {
    machine: 'aarch64',
    cpuArch: 'arm64',
    cpuCount: 72,
    memoryTotalBytes: 512 * 1024 ** 3,
    homeDirectory: '/home/mmt',
  },
  pythons: [
    { path: '/usr/bin/python3.9', version: '3.9.18' },
    { path: '/usr/bin/python3', version: '3.12.3' },
    { path: '/home/mmt/.venvs/train/bin/python', version: null },
  ],
  directories: [
    { path: '/home/mmt', source: 'home', writable: true, freeBytes: 1024 ** 4 },
    { path: '/home/mmt/projects', source: 'home_child', writable: true, freeBytes: null },
    { path: '/data', source: 'mount', writable: false, freeBytes: 1024 ** 3 },
  ],
};

export const setupCheck: TargetCheck = {
  id: 'check-setup',
  targetId: 'target',
  requestedBy: 'admin',
  status: 'finished',
  workerId: 'gpu-worker',
  assignedWorker: { tokenId: 'token-1', workerId: 'gpu-worker' },
  result: setupCheckResult,
  failureReason: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  claimedAt: '2026-10-11T00:00:02.000Z',
  finishedAt: '2026-10-11T00:00:09.000Z',
};

export const checkWorker: TargetCheckWorkerPresence = {
  tokenId: 'token-1',
  tokenName: 'GPU worker',
  projectId: 'project',
  workerId: 'gpu-worker',
  hostname: 'gpu-worker.internal',
  version: '0.1.0',
  lastSeenAt: '2026-10-11T00:00:00.000Z',
  sshFiles: {
    keyPaths: ['/home/worker/.ssh/id_ed25519', '/home/worker/.ssh/lab.pem'],
    knownHostsPaths: ['/home/worker/.ssh/known_hosts'],
  },
};

export const projectsListing: TargetDirectoryListingResult = {
  path: '/home/mmt/projects',
  outcome: 'ok',
  entries: [
    { name: 'mmt-work', kind: 'directory', executable: true },
    { name: 'models', kind: 'directory', executable: true },
    { name: '.cache', kind: 'directory', executable: true },
    { name: 'run.sh', kind: 'file', executable: true },
    { name: 'notes.txt', kind: 'file', executable: false },
  ],
  truncated: false,
};
