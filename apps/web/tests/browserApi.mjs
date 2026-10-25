// ブラウザテスト用の分離したAPI。このモジュールを本番のコードがimportすることはない。
import { createHash } from 'node:crypto';
import { routeBuiltinPlugins } from './builtinPluginMock.mjs';
import { listProjectArtifacts, listRunArtifacts, runArtifactTree } from './artifactListingMock.mjs';
import { createProjectAdministration } from './projectAdministrationMock.mjs';
import { createComputerSetup } from './computerSetupMock.mjs';
import { findCodeVersionDetail, listModelFamilies, ruleMetricKeys } from './registryLookupMock.mjs';
import { pageAutomationExecutions } from './automationExecutionMock.mjs';
// MMT_ARTIFACT_DELETE_GRACE_DAYSのAPIの既定値（apps/api/src/config.ts）。
const DEFAULT_ARTIFACT_DELETE_GRACE_DAYS = 7;
// TokenSummary.tokenPrefix: tokenの値の先頭の文字。
const TOKEN_PREFIX_LENGTH = 12;
// コンピュータと設定の画面が開くときに読む一覧。モックはどれも持たない。
// tasks: コードの画面は、コードバージョンを使うTaskを並べる（Taskを使う確認は自前でrouteする）。
const EMPTY_PROJECT_LISTS = [
  'workers',
  'group-bindings',
  'service-accounts',
  'notification-channels',
  'notification-rules',
  'notification-deliveries',
  'tasks',
];
// コンピュータがだれのJobを受け取るか。APIの決め方（targetUsableSql）に合わせる: publicなら
// 全員の、privateなら所有者のJob。モックにはService Accountが無い。
function isTargetUsable(target, user) {
  return target.visibility === 'public' || target.ownerUserId === user.id;
}

function isTargetManager(target, user) {
  return user.isAdmin || target.ownerUserId === user.id;
}

// GET /targets/overview: すべてのコンピュータの行。どう接続するかは一切含めない。
function targetOverview(target, state) {
  const launcher =
    target.executor === 'site' && target.submissionMode === 'automatic' && target.site?.launcherId
      ? state.launchers.find((item) => item.id === target.site.launcherId)
      : undefined;
  return {
    id: target.id,
    name: target.name,
    executor: target.executor,
    submissionMode: target.submissionMode,
    cpuArch: target.cpuArch,
    supportsArray: target.supportsArray,
    enabled: target.enabled,
    visibility: target.visibility,
    ownerUserId: target.ownerUserId,
    ownerName: target.ownerName,
    usable: isTargetUsable(target, state.user),
    canManage: isTargetManager(target, state.user),
    launcher: launcher
      ? { name: launcher.name, lastSeenAt: launcher.lastSeenAt, revoked: launcher.revokedAt !== null }
      : null,
  };
}

export function createBrowserApi() {
  let sequence = 100;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  const now = '2026-10-08T00:00:00Z';
  const user = {
    id: id(),
    email: 'ui-test@example.invalid',
    displayName: 'UI検証担当',
    isAdmin: true,
    username: 'ui-test',
    status: 'active',
    authSources: ['local'],
    kind: 'human',
  };
  const project = {
    id: id(),
    name: 'UI検証用プロジェクト',
    description: 'ブラウザテストのAPIデータ',
    artifactBackend: 'filesystem',
    // 公開範囲ができる前からあるProjectはprivateのまま（migration 054）。
    visibility: 'private',
    role: 'admin',
    // ログイン中の利用者が作ったので、"/"でこのProjectが開く。
    isMember: true,
    createdAt: now,
  };
  const projectAdministration = createProjectAdministration({ id, now, user, mainProject: project });
  const experiment = {
    id: id(),
    projectId: project.id,
    name: 'UI検証用実験',
    description: '',
    runCount: 3,
    createdAt: now,
  };
  const model = {
    id: id(),
    projectId: project.id,
    name: 'UI検証モデル',
    family: 'test-family',
    description: '',
    latestVersion: 'v1',
    aliases: {},
    createdAt: now,
  };
  const code = {
    id: id(),
    projectId: project.id,
    name: 'UI検証コード',
    description: '',
    latestVersion: 'v1',
    createdAt: now,
  };
  const dataset = {
    id: id(),
    projectId: project.id,
    name: 'UI検証データ',
    namespace: 'test',
    description: '',
    latestVersion: 'v1',
    archivedAt: null,
    createdAt: now,
  };
  const codeVersion = {
    id: id(),
    codeId: code.id,
    projectId: project.id,
    version: 'v1',
    source: { kind: 'inline', files: { 'main.py': 'print("browser-test")' } },
    runtime: { kind: 'python' },
    entrypoint: ['python3', 'main.py'],
    requirements: [],
    environment: {},
    supportedModelFamilies: ['test-family'],
    taskTypes: ['inference', 'training', 'finetuning'],
    createdAt: now,
  };
  const modelVersion = {
    id: id(),
    modelId: model.id,
    projectId: project.id,
    version: 'v1',
    family: model.family,
    sourceRunId: null,
    parentModelVersionIds: [],
    weightsUri: 'file:///test/weights',
    artifactId: null,
    defaultCodeVersionId: codeVersion.id,
    metadata: {},
    createdAt: now,
  };
  const datasetVersion = {
    id: id(),
    datasetId: dataset.id,
    projectId: project.id,
    name: dataset.name,
    namespace: dataset.namespace,
    version: 'v1',
    uri: 'file:///test/data',
    digest: 'test-digest',
    schema: {},
    metadata: {},
    sourceRunId: null,
    parentDatasetVersionIds: [],
    externalRef: null,
    contentKind: 'reference',
    fileCount: null,
    totalSize: null,
    createdAt: now,
  };
  // POST /jobsが作るのと同じ待機中のJob。要求が送らない項目を埋める。
  const makeJob = (body) => ({
    id: id(),
    projectId: project.id,
    // site・アレイジョブ・フック・ドライバー用のJobの項目。sshのJobでは既定値のまま。
    phase: null,
    gpuCount: body.gpuIds?.length ?? 0,
    walltimeSeconds: null,
    schedulerJobId: null,
    submittedAt: null,
    runnerHost: null,
    arrayGroupId: null,
    arrayIndex: null,
    arraySize: null,
    endReason: null,
    parentJobId: null,
    chainDepth: 0,
    hookId: null,
    allowChildJobs: false,
    retryOnFailure: false,
    retryOnTimeout: false,
    datasetPartitionVersionId: null,
    siteJobShellId: null,
    ...body,
    status: 'queued',
    cancelRequested: false,
    attempt: 0,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    heartbeatAt: null,
    error: null,
    exitCode: null,
  });
  const makeRun = (body) => ({
    id: id(),
    projectId: project.id,
    experimentId: experiment.id,
    name: 'UI test',
    kind: 'inference',
    status: 'queued',
    parameters: {},
    tags: {},
    latestMetrics: {},
    modelVersionId: null,
    codeVersionId: null,
    inputDatasetVersionIds: [],
    outputDatasetVersionIds: [],
    outputModelVersionIds: [],
    parentRunId: null,
    environment: {},
    createdBy: user.id,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    error: null,
    ...body,
  });
  const runs = [
    makeRun({
      name: 'training-test-01',
      kind: 'training',
      status: 'finished',
      modelVersionId: modelVersion.id,
      codeVersionId: codeVersion.id,
      inputDatasetVersionIds: [datasetVersion.id],
      parameters: { lr: 0.001, batch_size: 32, spk_emb: true },
      latestMetrics: {
        'val/loss': 0.12,
        accuracy: 0.89,
        'train/loss': 0.123456789123,
        'val/cer': 0.0098123456,
      },
      startedAt: '2026-10-07T20:00:00Z',
      endedAt: now,
    }),
    makeRun({
      name: 'training-test-02',
      kind: 'training',
      status: 'finished',
      parameters: { lr: 0.0003, batch_size: 16, spk_emb: false },
      latestMetrics: { 'val/loss': 0.18, accuracy: 0.83 },
      startedAt: '2026-10-07T18:00:00Z',
      endedAt: now,
    }),
    makeRun({
      name: 'finetuning-test-03',
      kind: 'finetuning',
      status: 'running',
      parameters: { lr: 0.0001, batch_size: 32, spk_emb: true },
      latestMetrics: { 'val/loss': 0.15 },
      startedAt: now,
    }),
  ];
  const target = {
    id: id(),
    name: 'UI検証Compute',
    host: 'test.invalid',
    port: 22,
    username: 'test',
    sshKeyPath: '/test/key',
    knownHostsPath: '/test/known_hosts',
    workDirectory: '/test/work',
    pythonExecutable: 'python3',
    runtimeKinds: ['python'],
    gpuIds: ['0', '1'],
    maxConcurrentJobs: 1,
    enabled: true,
    executor: 'ssh',
    // migration 047のAPIの既定値。
    datasetCacheMaxBytes: 107374182400,
    datasetTransfer: 'relay',
    // migration 051（site）のAPIの既定値。
    submissionMode: 'automatic',
    cpuArch: 'amd64',
    supportsArray: false,
    queueTimeoutSeconds: null,
    // migration 057: 所有者ができる前からあるtargetはpublicで、GET /targetsは全員に返す。
    ownerUserId: null,
    ownerName: null,
    visibility: 'public',
    site: null,
    siteAccountMode: null,
  };
  const plugin = {
    id: id(),
    projectId: project.id,
    name: 'Mado',
    kind: 'mado',
    config: {apiUrl: 'http://test.invalid', webUrl: 'https://mado.example.invalid', lineageUrl: 'http://test.invalid', jobNamespace: 'mado-model-tracking', storageSystemKey: 'mado-model-tracking'},
    configRevision: 1,
    credentialsConfigured: {accessToken: true},
    secretStorageAvailable: true,
    tokenConfigured: true, enabled: true, manifest: null, accessTokenGrant: null,
    createdAt: now,
  };
  const manifest = {
    id: 'mado',
    name: plugin.name,
    version: '1.0.0',
    protocolVersion: '1.0',
    capabilities: ['datasets:search', 'lineage:publish', 'storage:metrics'],
  };
  const artifact = {
    id: id(),
    projectId: project.id,
    runId: runs[0].id,
    path: 'test.txt',
    backend: 'filesystem',
    storageKey: 'test',
    mimeType: 'text/plain',
    size: 21,
    sha256: createHash('sha256').update('Browser test artifact').digest('hex'),
    createdAt: now,
  };
  // コンピュータは`state.targets`から読む。テストがこれを差し替えることがある。
  const computerSetup = createComputerSetup({
    id,
    now,
    projectId: project.id,
    targets: () => state.targets,
  });
  const state = {
    user,
    project,
    // アーカイブの状態を含むすべてのProjectと、POST /projectsが受け取った本文。
    projectAdministration: projectAdministration.state,
    // 用意中のコンピュータのworker、接続確認、ディレクトリの一覧。
    computerSetup: computerSetup.state,
    loggedIn: false,
    authMode: 'development',
    experiments: [experiment],
    models: [model],
    modelVersions: [modelVersion],
    codes: [code],
    codeVersions: [codeVersion],
    datasets: [dataset],
    datasetVersions: [datasetVersion],
    runs,
    targets: [target],
    launchers: [],
    jobs: [],
    automationRules: [],
    automationExecutions: [],
    plugins: [plugin],
    // 接続確認のとき、フィクスチャのmado S3 Data Catalogが保存済みのアクセストークンについて返す内容。
    madoAccessTokenGrant: {
      name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'], namespaces: ['test'], expiresAt: null,
    },
    tokens: [],
    artifacts: [artifact],
    calls: [],
    failRunList: false,
    failNextJob: false,
    failNextAutomation: false,
    failNextAutomationToggle: false,
    failProjectArtifacts: false,
    failPluginMetrics: false,
    metricsGate: null,
    prometheus: `# HELP mado_storage_bucket_bytes Latest measured bucket size in bytes.
# TYPE mado_storage_bucket_bytes gauge
mado_storage_connection_info{connection_id="ui-c1",connection_name="UI検証ストレージ"} 1
mado_storage_capacity_tracking_enabled{connection_id="ui-c1"} 1
mado_storage_capacity_tracking_interval_seconds{connection_id="ui-c1"} 300
mado_storage_bucket_bytes{connection_id="ui-c1",bucket="audio"} 3221225472
mado_storage_bucket_objects{connection_id="ui-c1",bucket="audio"} 1200000
mado_storage_capacity_collection_age_seconds{connection_id="ui-c1",bucket="audio"} 65.5
mado_storage_capacity_collection_failures{connection_id="ui-c1",bucket="audio"} 0
mado_storage_prefix_bytes{connection_id="ui-c1",bucket="audio",prefix="speech/"} 1073741824
mado_storage_prefix_objects{connection_id="ui-c1",bucket="audio",prefix="speech/"} 400000
mado_storage_capacity_collection_failures{connection_id="ui-c1",bucket="unmeasured"} 2
`,
  };
  const item = (array, key) => array.find((value) => value.id === key);
  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const body = request.headers()['content-type']?.includes('application/json')
      ? request.postDataJSON()
      : {};
    state.calls.push({ method, path, body });
    const reply = (payload, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const list = (items) => reply({ items });
    // APIが知らないidに返す応答（domain/errors.ts）。
    const notFound = (entity) => reply({ error: `${entity} not found`, code: 'not_found' }, 404);
    if (path === '/auth/config')
      return reply({
        mode: state.authMode,
        methods: {
          local: state.authMode === 'local' || state.authMode === 'hybrid',
          oidc:
            state.authMode === 'oidc' || state.authMode === 'hybrid'
              ? { label: 'Authentik', loginUrl: '/api/auth/login' }
              : null,
        },
      });
    if (path === '/auth/login') {
      state.loggedIn = true;
      return route.fulfill({ status: 302, headers: { location: url.origin + '/' }, body: '' });
    }
    if (path === '/auth/me')
      return state.loggedIn
        ? reply({ user, mustChangePassword: false })
        : reply({ error: 'Unauthorized' }, 401);
    if (path === '/auth/dev-login') {
      state.loggedIn = true;
      return reply({ user, mustChangePassword: false });
    }
    if (path === '/auth/change-password' && method === 'POST')
      return route.fulfill({ status: 204, body: '' });
    if (path === '/auth/logout') {
      state.loggedIn = false;
      return reply({ ok: true });
    }
    if (!state.loggedIn) return reply({ error: 'Unauthorized' }, 401);
    if (path === '/storage/backends')
      return reply({ items: ['filesystem', 's3'], defaultBackend: 'filesystem' });
    const projectAnswer = projectAdministration.handle({
      path,
      method,
      url,
      body,
      reply,
      list,
      fulfillEmpty: () => route.fulfill({ status: 204, body: '' }),
    });
    if (projectAnswer) return projectAnswer;
    const computerSetupAnswer = computerSetup.handle({ path, method, body, reply, list });
    if (computerSetupAnswer) return computerSetupAnswer;
    // 全体管理者のコンピュータの詳細に出す、すべてのProjectのworker（state.workers）。
    if (path === '/workers' && method === 'GET') return list(state.workers ?? []);
    if (path === '/targets/overview' && method === 'GET')
      return list(state.targets.map((target) => targetOverview(target, state)));
    if (path === '/targets') {
      // projectIdがあればJobを作る画面からの要求: 利用者が実行に使えるものだけを返す。
      if (method === 'GET')
        return list(
          state.targets.filter(
            (target) =>
              isTargetUsable(target, user) ||
              (!url.searchParams.has('projectId') && isTargetManager(target, user)),
          ),
        );
      // 最初のjob shellはtargetに含めない。足した人が所有者になる。
      const { jobShell: _jobShell, site, ...fields } = body;
      const target = {
        id: id(),
        ...fields,
        visibility: fields.visibility ?? 'private',
        ownerUserId: user.id,
        ownerName: user.displayName,
        site: site ? { ...site, jobShell: null } : null,
        siteAccountMode: site ? (site.accountMode ?? 'personal') : null,
      };
      state.targets.push(target);
      return reply(target, 201);
    }
    if (path === '/launchers' && method === 'GET') return list(state.launchers);
    // 上部バーのベル: 利用者が開けるすべてのProjectのアラート。モックには無い。
    if (path === '/operations-alerts' && method === 'GET') return list([]);
    // 全体管理 → 監査ログ。モックはイベントを持たない。
    if (path === '/audit-events' && method === 'GET') return reply({ items: [], nextCursor: null });
    // 通知先が名前で指定できる変数。モックのサーバーには1つある。
    if (path === '/notification-channels/environment-names' && method === 'GET')
      return list(['MMT_NOTIFICATION_SLACK_URL']);
    // 全体設定 → アカウント（/settings/account）。ユーザーメニューとリダイレクトの行き先。
    if (path === '/account' && method === 'GET')
      return reply({
        user: { ...user, lastLoginAt: now, createdAt: now },
        groups: [],
        groupsSyncedAt: null,
        sessionAuthMethod: 'local',
      });
    if (path === '/tokens') {
      if (method === 'GET') return list(state.tokens);
      // ログイン中の利用者が自分用に発行したtokenのTokenSummary。
      const value = 'browser-test-value-only';
      const token = {
        id: id(),
        ...body,
        projectId: body.projectId ?? null,
        lastUsedAt: null,
        expiresAt: body.expiresAt ?? null,
        createdAt: now,
        ownerType: 'user',
        ownerId: user.id,
        ownerName: user.displayName,
        tokenPrefix: value.slice(0, TOKEN_PREFIX_LENGTH),
        legacy: false,
      };
      state.tokens.push(token);
      return reply({ token: value, item: token });
    }
    if (path.startsWith('/tokens/') && method === 'DELETE') {
      state.tokens = state.tokens.filter((token) => token.id !== path.split('/')[2]);
      return reply({ ok: true });
    }
    const parts = path.split('/').filter(Boolean).slice(2);
    const [resource, key, subresource] = parts;
    if (resource === 'automation-rules') {
      if (key && subresource === 'metric-keys' && method === 'GET') {
        const rule = item(state.automationRules, key);
        return rule ? reply(ruleMetricKeys(state, rule)) : notFound('ModelAutomationRule');
      }
      if (method === 'GET') return list(state.automationRules);
      if (!user.isAdmin && project.role !== 'admin') return reply({ error: 'Admin required' }, 403);
      if (method === 'POST') {
        if (state.failNextAutomation) {
          state.failNextAutomation = false;
          return reply({ error: 'UI verification: automation storage unavailable' }, 503);
        }
        const rule = {
          id: id(),
          projectId: project.id,
          createdBy: user.id,
          createdAt: now,
          ...body,
        };
        state.automationRules.unshift(rule);
        return reply(rule, 201);
      }
      if (method === 'PATCH') {
        if (Object.keys(body).length !== 1 || typeof body.enabled !== 'boolean')
          return reply({ error: 'Only enabled can change' }, 400);
        if (state.failNextAutomationToggle) {
          state.failNextAutomationToggle = false;
          return reply({ error: 'UI verification: toggle failed' }, 503);
        }
        const rule = item(state.automationRules, key);
        rule.enabled = body.enabled;
        return reply(rule);
      }
    }
    if (resource === 'automation-executions' && method === 'GET')
      return reply(pageAutomationExecutions(state.automationExecutions, url.searchParams));
    if (resource === 'audit-events' && method === 'GET') return reply({ items: [], nextCursor: null });
    // 昇格のダイアログはaliasを設定する前にこれらを読む。モックはどれも持たない。
    if (resource === 'alias-protections' && method === 'GET') return list([]);
    if (resource === 'promotion-policies' && method === 'GET') return list([]);
    if (resource === 'promotion-evaluations' && method === 'GET')
      return reply({ items: [], nextCursor: null });
    if (resource === 'operations-alerts' && method === 'GET') return list([]);
    // Projectのworker（WorkerPresence）。オンラインのworkerが要るテストはstate.workersを設定する。
    if (resource === 'workers' && !key && method === 'GET') return list(state.workers ?? []);
    if (EMPTY_PROJECT_LISTS.includes(resource) && !key && method === 'GET') return list([]);
    // Artifactの使われている場所: モックのファイルはどこにも使われていないので、どれも削除できる。
    if (resource === 'artifact-references' && method === 'GET')
      return list(
        (url.searchParams.get('artifactIds') ?? '')
          .split(',')
          .filter(Boolean)
          .map((artifactId) => ({ artifactId, modelVersions: [], datasetVersions: [], codeVersions: [], checkpoints: [] })),
      );
    // モックのデータセットには、バージョンを作る前に止まったフォルダのアップロードは無い。
    if (resource === 'datasets' && key && subresource === 'folder-uploads' && method === 'GET') return list([]);
    // 設定画面の保存先ごとの使用量。モックは何も返さない。
    if (resource === 'artifact-usage' && method === 'GET')
      return reply({ backends: [], deleteGraceDays: DEFAULT_ARTIFACT_DELETE_GRACE_DAYS });
    // Projectに限定したtokenをすべて返すので、設定画面で発行したものもここに並ぶ。
    if (resource === 'tokens' && !key && method === 'GET')
      return list(state.tokens.filter((token) => token.projectId === project.id));
    if (resource === 'members') {
      // ProjectMember: モックはroleを直接与え、SSOのグループを結び付けない。
      if (method === 'GET')
        return list([{ user, role: project.role, directRole: project.role, groups: [] }]);
      return reply({ user, role: body.role, directRole: body.role, groups: [] });
    }
    if (resource === 'lineage')
      return reply({
        nodes: [
          { id: datasetVersion.id, kind: 'datasetVersion', label: dataset.name },
          { id: runs[0].id, kind: 'run', label: runs[0].name },
          { id: modelVersion.id, kind: 'modelVersion', label: model.name },
          { id: codeVersion.id, kind: 'codeVersion', label: code.name },
        ],
        edges: [
          { source: datasetVersion.id, target: runs[0].id, relation: 'input' },
          { source: codeVersion.id, target: runs[0].id, relation: 'code' },
          { source: runs[0].id, target: modelVersion.id, relation: 'outputModel' },
        ],
      });
    if (resource === 'experiments') {
      if (method === 'GET') return list(state.experiments);
      const experiment = { id: id(), projectId: project.id, ...body, runCount: 0, createdAt: now };
      state.experiments.push(experiment);
      return reply(experiment);
    }
    if (resource === 'runs') {
      const isRunList = (key === 'search' && method === 'POST') || (!key && method === 'GET');
      // Runの画面はネイティブの検索で一覧を出す。どちらの一覧の取り方も一緒に失敗させる。
      if (state.failRunList && isRunList)
        return reply({ error: 'UI verification: database unavailable' }, 503);
      // フィルタを解釈しないネイティブの検索。最近のRunを並べる画面にはこれで足りる。
      if (key === 'search' && method === 'POST')
        return reply({
          items: state.runs.filter(
            (run) =>
              (!body.experimentIds?.length || body.experimentIds.includes(run.experimentId)) &&
              (!body.statuses?.length || body.statuses.includes(run.status)) &&
              (!body.name || run.name.toLowerCase().includes(body.name.toLowerCase())),
          ),
          nextCursor: null,
        });
      if (!key && method === 'GET')
        return list(
          state.runs.filter(
            (run) =>
              (!url.searchParams.get('status') || run.status === url.searchParams.get('status')) &&
              (!url.searchParams.get('experimentId') ||
                run.experimentId === url.searchParams.get('experimentId')),
          ),
        );
      if (!key && method === 'POST') {
        const run = makeRun(body);
        state.runs.push(run);
        return reply(run);
      }
      // 選んだRunの、行を持たないRunComparison。比較のタブを開くにはこれで足りる。
      if (key === 'compare' && method === 'POST')
        return reply({
          runs: body.runIds.map((runId) => item(state.runs, runId)).filter(Boolean),
          baselineRunId: null,
          datasetVersions: [],
          modelVersions: [],
          rows: [],
        });
      const run = item(state.runs, key);
      if (!subresource) {
        if (method === 'PATCH') Object.assign(run, body);
        return reply(run);
      }
      if (subresource === 'metrics')
        return list([
          { name: 'val/loss', value: 0.9, step: 0, timestamp: now },
          {
            name: 'val/loss',
            value: run.latestMetrics['val/loss'] ?? 0.12,
            step: 100,
            timestamp: now,
          },
          { name: 'system/gpu.utilization', value: 64, step: 100, timestamp: now },
        ]);
      if (subresource === 'logs')
        return reply({
          items: [{ timestamp: now, level: 'info', message: 'Browser test log' }],
          totalCount: 1,
        });
      if (subresource === 'artifacts' && parts[3] === 'tree')
        return reply(runArtifactTree(state.artifacts, key, url.searchParams));
      if (subresource === 'artifacts') {
        if (method === 'GET') return reply(listRunArtifacts(state.artifacts, key, url.searchParams));
        const artifact = {
          id: id(),
          projectId: project.id,
          runId: key,
          path: url.searchParams.get('path'),
          backend: 'filesystem',
          storageKey: 'test',
          mimeType: request.headers()['content-type'],
          size: request.postDataBuffer()?.length ?? 0,
          sha256: createHash('sha256')
            .update(request.postDataBuffer() ?? Buffer.alloc(0))
            .digest('hex'),
          createdAt: now,
        };
        state.artifacts.push(artifact);
        return reply(artifact);
      }
    }
    // アップロードのダイアログは、続きを送れるよう利用者の開いているセッションを並べる。モックは
    // 持たない: そのファイルはSINGLE_PUT_MAX_BYTES（src/lib/uploadPlan.ts）より小さく、下のPUTで送る。
    if (resource === 'artifact-uploads' && !key && method === 'GET') return list([]);
    if (resource === 'artifacts' && !key && method === 'GET') {
      if (state.failProjectArtifacts)
        return reply({ error: 'UI verification: artifact catalog unavailable' }, 503);
      return reply(listProjectArtifacts(state.artifacts, url.searchParams));
    }
    if (resource === 'artifacts' && method === 'PUT') {
      const created = {
        ...artifact,
        id: id(),
        runId: null,
        path: url.searchParams.get('path'),
        mimeType: request.headers()['content-type'],
        size: request.postDataBuffer()?.length ?? 0,
        sha256: createHash('sha256')
          .update(request.postDataBuffer() ?? Buffer.alloc(0))
          .digest('hex'),
      };
      state.artifacts.push(created);
      return reply(created);
    }
    if (resource === 'artifacts' && key && !subresource && method === 'GET')
      return reply(item(state.artifacts, key));
    if (resource === 'artifacts' && subresource === 'content')
      return route.fulfill({ contentType: 'text/plain', body: 'Browser test artifact' });
    // モデルの画面が値の候補に使う、レジストリの参照（registryLookupMock.mjs）。
    if (resource === 'model-families' && !key && method === 'GET') return list(listModelFamilies(state));
    if (resource === 'code-versions' && key && !subresource && method === 'GET') {
      const detail = findCodeVersionDetail(state, key);
      return detail ? reply(detail) : notFound('CodeVersion');
    }
    if (['models', 'codes', 'datasets'].includes(resource)) {
      const collection = state[resource];
      const versionCollection =
        state[
          { models: 'modelVersions', codes: 'codeVersions', datasets: 'datasetVersions' }[resource]
        ];
      const parentKey = { models: 'modelId', codes: 'codeId', datasets: 'datasetId' }[resource];
      if (!key && method === 'GET') return list(collection);
      if (!key && method === 'POST') {
        const entity = {
          id: id(),
          projectId: project.id,
          latestVersion: null,
          aliases: {},
          namespace: '',
          description: '',
          ...body,
          createdAt: now,
        };
        collection.push(entity);
        return reply(entity);
      }
      if (subresource === 'versions' && method === 'GET')
        return list(versionCollection.filter((version) => version[parentKey] === key));
      if (subresource === 'versions' && method === 'POST') {
        const parent = item(collection, key);
        parent.latestVersion = body.version;
        const version = {
          id: id(),
          projectId: project.id,
          [parentKey]: key,
          sourceRunId: null,
          parentModelVersionIds: [],
          parentDatasetVersionIds: [],
          defaultCodeVersionId: null,
          artifactId: null,
          weightsUri: null,
          schema: {},
          metadata: {},
          externalRef: null,
          family: parent.family,
          name: parent.name,
          namespace: parent.namespace,
          ...body,
          createdAt: now,
        };
        versionCollection.push(version);
        return reply(version);
      }
      if (subresource === 'aliases') {
        item(collection, key).aliases[parts[3]] = body.versionId;
        return reply(item(collection, key));
      }
      // モデルのaliasの履歴。モックはイベントを記録しない。
      if (subresource === 'alias-events' && method === 'GET')
        return reply({ items: [], nextCursor: null });
    }
    if (resource === 'jobs') {
      // GETはJobListItemを返す: JobにRunとTaskの名前を足したもの（api-contract.mdを参照）。
      if (!key && method === 'GET')
        return list(
          state.jobs.map((job) => {
            const run = state.runs.find((candidate) => candidate.id === job.runId);
            return {
              ...job,
              runName: run?.name ?? job.runId,
              runKind: run?.kind ?? 'training',
              taskId: run?.taskId ?? null,
              taskName: null,
              sweepEarlyStopped: false,
              // Jobを始めた人: そのRunを作った人（api-contract.md）。
              createdBy: run?.createdBy ?? state.user.id,
              createdByName: run?.createdByName ?? state.user.displayName,
              // checkpoint、Sweep、自動実行ルールが元にあるJobが要るテストは、それをJobに設定する。
              hasResumeCheckpoint: job.hasResumeCheckpoint ?? false,
              sweepTrial: job.sweepTrial ?? null,
              automationRule: job.automationRule ?? null,
              // ワークフローのステップのJobが要るテストは、これらをJobに設定する。
              workflowExecution: job.workflowExecution ?? null,
              requiredWorkerCapabilities: job.requiredWorkerCapabilities ?? [],
            };
          }),
        );
      // RunとそのJobを一緒に作る（POST /jobs/launch）。Jobが断られたらRunは残さない。
      if (key === 'launch' && method === 'POST') {
        if (state.failNextJob) {
          state.failNextJob = false;
          return reply({ error: 'UI verification: enqueue failed' }, 503);
        }
        const run = makeRun(body.run);
        state.runs.push(run);
        const job = makeJob({ ...body.job, runId: run.id });
        state.jobs.push(job);
        return reply({ run, job });
      }
      if (!key && method === 'POST') {
        if (state.failNextJob) {
          state.failNextJob = false;
          return reply({ error: 'UI verification: enqueue failed' }, 503);
        }
        const job = makeJob(body);
        state.jobs.push(job);
        return reply(job);
      }
      if (subresource === 'cancel') {
        const job = item(state.jobs, key);
        job.cancelRequested = true;
        return reply(job);
      }
      if (subresource === 'retry') {
        const oldJob = item(state.jobs, key);
        const run = makeRun({ ...item(state.runs, oldJob.runId), id: id(), status: 'queued' });
        state.runs.push(run);
        const job = { ...oldJob, id: id(), runId: run.id, status: 'queued' };
        state.jobs.push(job);
        return reply({ run, job });
      }
    }
    if (resource === 'plugins')
      return routeBuiltinPlugins({state, request: {method, key, subresource, parts, body}, reply, id, now, project, user, datasetVersion, manifest});
    // テスト自身の出力にも出す。モックに無いAPIを画面が呼んでも、失敗するのはコンソールを見ている
    // 確認だけなので、足りないrouteはここで見つけるほうが早い。
    console.warn(`[browserApi] 501 Unhandled test API: ${method} ${path}`);
    return reply({ error: `Unhandled test API: ${method} ${path}` }, 501);
  }
  return { state, route };
}
