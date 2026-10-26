// sshとlocalのコンピュータを2段階で足す流れ。docs/api-contract.mdの「targetの接続確認」に従う:
// 選べるworker、workerが次の読み出しまでに終える接続確認、workerが読むディレクトリ、コンピュータの
// 変更の保存（PATCH /targets/:id）。

// テストが`checkWorkers`を差し替えない限り、すべての接続確認が向かうworker。
const SETUP_WORKER = {
  tokenId: '00000000-0000-4000-8000-00000000c001',
  tokenName: 'UI検証worker',
  workerId: 'ui-worker',
  hostname: 'ui-worker.invalid',
  version: '0.1.0',
  sshFiles: {
    keyPaths: ['/home/worker/.ssh/id_ed25519', '/home/worker/.ssh/lab.pem'],
    knownHostsPaths: ['/home/worker/.ssh/known_hosts'],
  },
};

// モックのコンピュータでversion 2の接続確認が報告する内容（全runtime対応でGPU 2枚のサーバー）。
const SETUP_CHECK_RESULT = {
  version: 2,
  items: [
    { name: 'connection', status: 'ok', code: null, detail: null },
    { name: 'python', status: 'ok', code: null, detail: '3.12.3 /usr/bin/python3' },
    { name: 'venv', status: 'ok', code: null, detail: null },
    { name: 'pip', status: 'ok', code: null, detail: 'pip 24.0' },
    { name: 'docker', status: 'ok', code: null, detail: '27.1.1' },
    { name: 'gpu', status: 'ok', code: null, detail: '2' },
    { name: 'work_directory', status: 'skipped', code: 'work_directory_not_set', detail: null },
    { name: 'api', status: 'ok', code: null, detail: null },
  ],
  gpus: [
    { index: '0', uuid: 'GPU-ui-0', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
    { index: '1', uuid: 'GPU-ui-1', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
  ],
  runtimeKinds: ['python', 'docker', 'singularity', 'apptainer'],
  workDirectoryFreeBytes: null,
  host: {
    machine: 'x86_64',
    cpuArch: 'amd64',
    cpuCount: 64,
    memoryTotalBytes: 540_000_000_000,
    homeDirectory: '/home/mmt',
  },
  pythons: [
    { path: '/usr/bin/python3', version: '3.12.3' },
    { path: '/home/mmt/miniconda3/envs/train/bin/python', version: '3.11.9' },
  ],
  directories: [
    { path: '/home/mmt', source: 'home', writable: true, freeBytes: 1_000_000_000_000 },
    { path: '/large', source: 'mount', writable: true, freeBytes: 9_000_000_000_000 },
  ],
};

// workerが読めるディレクトリ。打ったパスの最後の/までをキーにする。
const READABLE_DIRECTORIES = {
  '/home/mmt/': [
    { name: 'container-work', kind: 'directory', executable: true },
    { name: 'projects', kind: 'directory', executable: true },
    { name: '.venvs', kind: 'directory', executable: true },
    { name: 'notes.txt', kind: 'file', executable: false },
  ],
  '/large/': [{ name: 'mmt', kind: 'directory', executable: true }],
};

export function createComputerSetup({ id, now, userId, projectId, targets }) {
  const state = {
    checkWorkers: [{ ...SETUP_WORKER, projectId, lastSeenAt: now }],
    // すべてのコンピュータのTargetCheckの行。新しい順。
    checks: [],
    listings: [],
    // workerが次に終える接続確認が報告する結果。nullなら受け取るworkerが無いままになる（no_worker）。
    nextCheckResult: SETUP_CHECK_RESULT,
  };
  const finishWaitingChecks = () => {
    for (const check of state.checks.filter((item) => item.status === 'queued'))
      Object.assign(
        check,
        state.nextCheckResult
          ? {
              status: 'finished',
              workerId: check.assignedWorker?.workerId ?? SETUP_WORKER.workerId,
              result: state.nextCheckResult,
              claimedAt: now,
              finishedAt: now,
            }
          : { status: 'failed', failureReason: 'no_worker', finishedAt: now },
      );
  };
  const readDirectory = (listing) => {
    const entries = READABLE_DIRECTORIES[listing.path];
    Object.assign(listing, {
      status: 'finished',
      workerId: listing.assignedWorker.workerId,
      finishedAt: now,
      result: {
        path: listing.path.replace(/^~\//, '/home/mmt/'),
        outcome: entries ? 'ok' : 'missing',
        entries: entries ?? [],
        truncated: false,
      },
    });
  };

  /** これらの経路の要求なら答え、そうでなければundefinedを返す。 */
  function handle({ path: requestPath, method, body, reply, list }) {
    if (requestPath === '/targets/check-workers' && method === 'GET')
      return list(state.checkWorkers);
    const match = /^\/targets\/([^/]+)(?:\/(checks|directory-listings)(?:\/([^/]+))?)?$/.exec(
      requestPath,
    );
    if (!match || match[1] === 'overview') return undefined;
    const [, targetId, resource, key] = match;
    const target = targets().find((item) => item.id === targetId);
    if (!target) return reply({ error: 'computer not found', code: 'not_found' }, 404);
    if (!resource && method === 'PATCH') {
      Object.assign(target, body);
      return reply(target);
    }
    if (resource === 'checks' && method === 'POST') {
      const check = {
        id: id(),
        targetId,
        requestedBy: userId,
        status: 'queued',
        workerId: null,
        assignedWorker: body.worker ?? null,
        result: null,
        failureReason: null,
        createdAt: now,
        claimedAt: null,
        finishedAt: null,
      };
      state.checks.unshift(check);
      return reply(check, 201);
    }
    if (resource === 'checks' && method === 'GET') {
      const answered = list(state.checks.filter((check) => check.targetId === targetId));
      // workerは2回の読み出しの間に接続確認を終える。本物も数秒で終える。
      finishWaitingChecks();
      return answered;
    }
    if (resource === 'directory-listings' && method === 'POST') {
      const listing = {
        id: id(),
        targetId,
        path: body.path,
        assignedWorker: body.worker,
        status: 'queued',
        workerId: null,
        result: null,
        failureReason: null,
        createdAt: now,
        finishedAt: null,
      };
      state.listings.push(listing);
      return reply(listing, 201);
    }
    if (resource === 'directory-listings' && method === 'GET' && key) {
      const listing = state.listings.find((item) => item.id === key);
      readDirectory(listing);
      return reply(listing);
    }
    return undefined;
  }
  return { state, handle };
}
