import type { MiddlewareHandler } from 'hono';
import type { JobTokenBinding } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { decodeArtifactLocation } from '../mlflow/artifacts/artifactPath.js';
import { decodeMultipartDirectory } from '../mlflow/artifacts/multipartProtocol.js';
import type { ArtifactLocation } from '../mlflow/artifacts/artifactTypes.js';
import {
  findArtifactUploadRunId,
  findLoggedModelSourceRunId,
} from '../repositories/jobTokenRepository.js';
import type { ApiContext, ApiEnvironment } from './request.js';

/**
 * Job token（mado_mtj_）で届く範囲を絞る。Job が動かすコードには作成者の role をそのまま任せず、
 * Project の読み取りと、自分の Run・その Run の Artifact・その Run を出どころにする登録への書き込み
 * だけを許す。ほかはすべて断るので、後から足した route はここに載せるまで Job token では使えない。
 */

export interface JobTokenRequest {
  projectId: string;
  job: JobTokenBinding;
  params: Record<string, string>;
  body: () => Promise<Record<string, unknown> | null>;
  database: Database;
}

export interface JobTokenRule {
  methods: readonly string[];
  // Honoの構文での経路のテンプレート。`:name`は1つのセグメントに、末尾の`*`は残り全部に一致する。
  route: string;
  allows: (request: JobTokenRequest) => boolean | Promise<boolean>;
}

const NATIVE = '/api/projects/:p';
const MLFLOW = '/api/mlflow/projects/:p/api/2.0/mlflow';
const MLFLOW_ARTIFACTS = '/api/mlflow/projects/:p/api/2.0/mlflow-artifacts/artifacts';
const MLFLOW_MULTIPART = '/api/mlflow/projects/:p/api/2.0/mlflow-artifacts/mpu';

function sameId(value: unknown, expected: string): boolean {
  return typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
}

// tokenのProjectの中ならどのリクエストも許す（比べるRunが無い）。
export const allowWithinProject = () => true;
const ownRunInPath = (request: JobTokenRequest) => sameId(request.params.r, request.job.runId);
const ownJobInPath = (request: JobTokenRequest) => sameId(request.params.j, request.job.jobId);
const ownRunInBody = (field: string) => async (request: JobTokenRequest) =>
  sameId((await request.body())?.[field], request.job.runId);
// MLflowは別名としてrun_uuidを受け付ける。食い違う組はtrackingのAPIの検証が拒む。
const ownMlflowRunInBody = async (request: JobTokenRequest) => {
  const body = await request.body();
  const runId = body?.run_id ?? body?.run_uuid;
  return (
    sameId(runId, request.job.runId) &&
    (body?.run_uuid === undefined || sameId(body.run_uuid, request.job.runId))
  );
};
const ownLoggedModel = async (request: JobTokenRequest) =>
  sameId(
    await findLoggedModelSourceRunId(request.database, {
      projectId: request.projectId,
      id: request.params.model_id!,
    }),
    request.job.runId,
  );
const ownArtifactUpload = async (request: JobTokenRequest) =>
  sameId(
    await findArtifactUploadRunId(request.database, {
      projectId: request.projectId,
      id: request.params.u!,
    }),
    request.job.runId,
  );
const ownArtifactLocation = (decode: (encodedPath: string) => ArtifactLocation) => async (
  request: JobTokenRequest,
) => {
  let location;
  try {
    location = decode(request.params['*']!);
  } catch {
    return false;
  }
  if (location.owner.kind === 'run') return sameId(location.owner.id, request.job.runId);
  if (location.owner.kind !== 'model') return false;
  return ownLoggedModel({
    ...request,
    params: { ...request.params, model_id: location.owner.id },
  });
};

// 登録するファイルは、このRunかそのLogged Modelのどれかから来なければならない。別のRunの
// ファイルや別の登録済みバージョンを、このRunの名前で写すことは拒む。
const ownRegistrationSource = async (request: JobTokenRequest) => {
  const body = await request.body();
  if (body?.run_id !== undefined && !sameId(body.run_id, request.job.runId)) return false;
  const source = typeof body?.source === 'string' ? body.source : '';
  const loggedModelId =
    /^models:\/(m-[a-f0-9]{32})$/.exec(source)?.[1] ??
    /^mlflow-artifacts:\/models\/(m-[a-f0-9]{32})\/artifacts\/?$/.exec(source)?.[1];
  if (loggedModelId)
    return ownLoggedModel({ ...request, params: { ...request.params, model_id: loggedModelId } });
  const runId =
    /^runs:\/([0-9a-f-]{36})\//.exec(source)?.[1] ??
    /^mlflow-artifacts:\/runs\/([0-9a-f-]{36})\/artifacts(?:\/|$)/.exec(source)?.[1];
  return sameId(runId, request.job.runId);
};

const MLFLOW_RUN_WRITES = [
  'update',
  'log-parameter',
  'log-metric',
  'log-batch',
  'set-tag',
  'delete-tag',
  'log-inputs',
  'outputs',
  'log-model',
];

// siteのJobのrunnerは自分のJobについて報告する（RunnerServiceがインスタンスIDを確かめる）。
const RUNNER_REPORTS = ['start', 'heartbeat', 'logs', 'metrics', 'outputs', 'finish'];

export const JOB_TOKEN_WRITE_RULES: readonly JobTokenRule[] = [
  { methods: ['PATCH'], route: `${NATIVE}/runs/:r`, allows: ownRunInPath },
  ...RUNNER_REPORTS.map((report) => ({
    methods: ['POST'],
    route: `${NATIVE}/jobs/:j/runner/${report}`,
    allows: ownJobInPath,
  })),
  // driverは自分のJobの下に子Jobを作る（ChildJobServiceがallowChildJobsを確かめる）。
  { methods: ['POST'], route: `${NATIVE}/jobs/:j/children`, allows: ownJobInPath },
  { methods: ['POST'], route: `${NATIVE}/runs/:r/metrics`, allows: ownRunInPath },
  { methods: ['PUT'], route: `${NATIVE}/runs/:r/preprocessing-report`, allows: ownRunInPath },
  { methods: ['POST'], route: `${NATIVE}/runs/:r/logs`, allows: ownRunInPath },
  { methods: ['PUT'], route: `${NATIVE}/runs/:r/artifacts`, allows: ownRunInPath },
  { methods: ['POST'], route: `${NATIVE}/runs/:r/checkpoints`, allows: ownRunInPath },
  { methods: ['POST'], route: `${NATIVE}/runs/:r/training-data-stages`, allows: ownRunInPath },
  { methods: ['POST'], route: `${NATIVE}/runs/:r/media`, allows: ownRunInPath },
  { methods: ['POST'], route: `${NATIVE}/artifact-uploads`, allows: ownRunInBody('runId') },
  {
    methods: ['PUT'],
    route: `${NATIVE}/artifact-uploads/:u/parts/:n`,
    allows: ownArtifactUpload,
  },
  {
    methods: ['POST'],
    route: `${NATIVE}/artifact-uploads/:u/complete`,
    allows: ownArtifactUpload,
  },
  { methods: ['DELETE'], route: `${NATIVE}/artifact-uploads/:u`, allows: ownArtifactUpload },
  // 出力のModelを作れるようにして、Taskがまだ無いモデル名へ登録できるようにする。
  { methods: ['POST'], route: `${NATIVE}/models`, allows: allowWithinProject },
  {
    methods: ['POST'],
    route: `${NATIVE}/models/:m/versions`,
    allows: ownRunInBody('sourceRunId'),
  },
  {
    methods: ['POST'],
    route: `${NATIVE}/datasets/:d/versions`,
    allows: ownRunInBody('sourceRunId'),
  },
  ...MLFLOW_RUN_WRITES.map((action) => ({
    methods: ['POST'],
    route: `${MLFLOW}/runs/${action}`,
    allows: ownMlflowRunInBody,
  })),
  {
    methods: ['POST'],
    route: `${MLFLOW}/model-versions/create`,
    allows: ownRegistrationSource,
  },
  { methods: ['POST'], route: `${MLFLOW}/registered-models/create`, allows: allowWithinProject },
  {
    methods: ['POST'],
    route: `${MLFLOW}/logged-models`,
    allows: ownRunInBody('source_run_id'),
  },
  { methods: ['PATCH'], route: `${MLFLOW}/logged-models/:model_id`, allows: ownLoggedModel },
  { methods: ['PATCH'], route: `${MLFLOW}/logged-models/:model_id/tags`, allows: ownLoggedModel },
  {
    methods: ['DELETE'],
    route: `${MLFLOW}/logged-models/:model_id/tags/:tag_key`,
    allows: ownLoggedModel,
  },
  {
    methods: ['POST'],
    route: `${MLFLOW}/logged-models/:model_id/params`,
    allows: ownLoggedModel,
  },
  {
    methods: ['PUT'],
    route: `${MLFLOW_ARTIFACTS}/*`,
    allows: ownArtifactLocation(decodeArtifactLocation),
  },
  // partのPUTはAuthorizationを持たない（part tokenはsessionが確かめる）ので、このガードに
  // 届くのはsessionを開く・閉じるリクエストだけ。
  ...['create', 'complete', 'abort'].map((action) => ({
    methods: ['POST'],
    route: `${MLFLOW_MULTIPART}/${action}/*`,
    allows: ownArtifactLocation(decodeMultipartDirectory),
  })),
];

// 読み取りはtokenのProjectの中に限る。上流のRunのArtifactはこうして読む。
// POSTの項目は読むだけの検索。
export const JOB_TOKEN_READ_RULES: readonly JobTokenRule[] = [
  // tokenのscopeとjobのフラグ（CurrentApiToken）。コードがJob tokenを持っていると分かるようにする。
  { methods: ['GET', 'HEAD'], route: '/api/auth/token', allows: allowWithinProject },
  { methods: ['GET', 'HEAD'], route: NATIVE, allows: allowWithinProject },
  { methods: ['GET', 'HEAD'], route: `${NATIVE}/*`, allows: allowWithinProject },
  { methods: ['GET', 'HEAD'], route: '/api/mlflow/projects/:p/*', allows: allowWithinProject },
  { methods: ['POST'], route: `${NATIVE}/runs/search`, allows: allowWithinProject },
  { methods: ['POST'], route: `${NATIVE}/media/compare`, allows: allowWithinProject },
  { methods: ['POST'], route: `${MLFLOW}/runs/search`, allows: allowWithinProject },
  { methods: ['POST'], route: `${MLFLOW}/experiments/search`, allows: allowWithinProject },
  { methods: ['POST'], route: `${MLFLOW}/logged-models/search`, allows: allowWithinProject },
  { methods: ['POST'], route: `${MLFLOW}/registered-models/get-latest-versions`, allows: allowWithinProject },
];

interface CompiledRule {
  rule: JobTokenRule;
  pattern: RegExp;
  names: string[];
}

function compile(rule: JobTokenRule): CompiledRule {
  const names: string[] = [];
  const source = rule.route
    .split('/')
    .map((segment) => {
      if (segment === '*') {
        names.push('*');
        return '(.*)';
      }
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { rule, pattern: new RegExp(`^${source}$`), names };
}

const COMPILED_RULES = [...JOB_TOKEN_WRITE_RULES, ...JOB_TOKEN_READ_RULES].map(compile);

function matchingRules(method: string, path: string) {
  const matches: { rule: JobTokenRule; params: Record<string, string> }[] = [];
  for (const { rule, pattern, names } of COMPILED_RULES) {
    if (!rule.methods.includes(method)) continue;
    const match = pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    names.forEach((name, index) => (params[name] = match[index + 1]!));
    matches.push({ rule, params });
  }
  return matches;
}

/**
 * Job tokenがある経路に届けるのはどちらの規則の一覧か。OpenAPIのドキュメント用。pathは経路の
 * テンプレート（`/api/projects/:p/runs/:r`）でもよく、`:name`のセグメントはパスの1セグメントに
 * 一致する。一致しても経路が開くだけで、規則自体の検査（たとえば「自分のRun」）は引き続きかかる。
 */
export function jobTokenAccessOf(method: string, path: string): 'write' | 'read' | null {
  const rules = matchingRules(method, path).map(({ rule }) => rule);
  if (rules.some((rule) => JOB_TOKEN_WRITE_RULES.includes(rule))) return 'write';
  return rules.length > 0 ? 'read' : null;
}

function forbidden(): never {
  throw new DomainError({
    status: 403,
    code: 'job_token_forbidden',
    message: 'this operation is not allowed with a Job token',
  });
}

async function readJsonObject(context: ApiContext): Promise<Record<string, unknown> | null> {
  try {
    // Honoは解析したbodyをキャッシュするので、経路のハンドラは後からでもbodyを読める。
    const body: unknown = await context.req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function jobTokenGuard(database: Database): MiddlewareHandler<ApiEnvironment> {
  return async (context, next) => {
    const token = context.get('principal')?.token;
    if (!token?.job || !token.projectId) return next();
    const { job, projectId } = token;
    // 生のパスで照合するので、パーセントエンコードしたセグメントは一致しなくなるだけで済む。
    // デコードするのはArtifactのパスだけで、その経路と同じ方法でデコードする。
    const path = new URL(context.req.url).pathname;
    for (const { rule, params } of matchingRules(context.req.method, path)) {
      // Projectの外の経路（health、token自身の説明）には比べる:pが無い。
      if (params.p !== undefined && !sameId(params.p, projectId)) continue;
      const allowed = await rule.allows({
        projectId,
        job,
        params,
        body: () => readJsonObject(context),
        database,
      });
      if (allowed) return next();
    }
    forbidden();
  };
}
