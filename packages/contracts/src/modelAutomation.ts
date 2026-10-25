import type { JobStatus, JsonObject, RunStatus } from './index.js';
import type { UserKind } from './adminUsers.js';

export interface ModelAutomationRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  modelFamilies: string[];
  kind: 'inference' | 'evaluation' | 'processing';
  // 'upstream_run_finished'では、upstreamRuleIdが作ったRunが終わったときにこのルールを始める。
  trigger: 'model_registered' | 'upstream_run_finished';
  upstreamRuleId: string | null;
  experimentId: string;
  codeVersionId: string;
  targetId: string;
  gpuIds: string[];
  inputDatasetVersionIds: string[];
  parameters: JsonObject;
  tags: Record<string, string>;
  maxAttempts: number;
  // バージョンのページでルールのRunをまとめるとき、この順で先頭に出すメトリクスの名前。
  summaryMetrics: string[];
  createdBy: string;
  // ルールがその権限で動き、Runを作るユーザー。Project adminがルールをService Accountへ移す
  // （PUT .../automation-rules/:id/owner）までは作成者。
  runAsUserId: string;
  // 表示用の、runAsUserIdが誰かを示す値。APIの応答には入るが、内部の読み出しには無いことがある。
  runAsKind?: Exclude<UserKind, 'launcher'>;
  runAsName?: string;
  // createdByの表示名。runAsNameと同じくAPIの応答に入る。
  createdByName: string;
  createdAt: string;
}

/** PUT /projects/:p/automation-rules/:id/owner */
export interface AutomationRuleOwnerTransfer {
  serviceAccountId: string;
}

export interface ModelAutomationExecution {
  id: string;
  projectId: string;
  ruleId: string;
  modelVersionId: string;
  runId: string | null;
  jobId: string | null;
  // 'pending'の行は保存された実行ではない。元のRunが終わったら動く有効なルールを示すもので、
  // その時点で保存された実行に置き換わる。
  status: 'pending' | 'queued' | 'failed' | 'skipped';
  // バージョンを作った学習のRun。自動実行はこのRunが成功して終わるのを待つ。
  sourceRunId: string | null;
  runStatus: RunStatus | null;
  jobStatus: JobStatus | null;
  // 始まったRunの時刻。バージョンのページで所要時間を出すのに使う。始まる前はnull。
  runStartedAt?: string | null;
  runEndedAt?: string | null;
  error: string | null;
  // この段を始めた上流のRun。パイプラインの最初の段ではnull。
  triggerRunId: string | null;
  // 同じパイプラインの最初の段の実行。最初の段ではidと同じ。
  pipelineRootExecutionId: string | null;
  attempt: number;
  source: 'automatic' | 'manual';
  // ルールを手で適用したProject admin。自動の実行ではnull。
  requestedBy: string | null;
  // この自動の再試行の元になった、失敗した実行。サーバーが再試行したとき以外はnull。
  retryOfExecutionId: string | null;
  createdAt: string;
}

/**
 * POST /projects/:p/automation-rules/:id/executions: 対象のバージョンか、連鎖したルールでは
 * 上流のRunを指定する。
 */
export type CreateAutomationExecution = { modelVersionId: string } | { triggerRunId: string };

/** GET /projects/:p/automation-executions?modelVersionId=&ruleId=&limit=&cursor= */
export interface ModelAutomationExecutionPage {
  items: ModelAutomationExecution[];
  nextCursor: string | null;
}
