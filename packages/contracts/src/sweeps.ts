// ハイパーパラメータのSweep。探索空間と早期終了の項目はW&Bのsweepの設定に従う
// （values / value / distribution+min+max+q、metric.goal、early_terminateのhyperband）。
import type { JobStatus, RunStatus } from './index.js';

export type SweepMethod = 'grid' | 'random' | 'bayes';

/**
 * 探索空間が 422 sweep_space_invalid になった理由（応答の `reason`）。画面はこれと横の項目
 * （`parameter`、`limit`、`count` など）から文を作る。
 */
export const SWEEP_SPACE_VIOLATIONS = [
  'parameters_empty',
  'parameter_limit',
  'parameter_name_empty',
  'definition_missing',
  'definition_ambiguous',
  'values_empty',
  'values_limit',
  'values_types',
  'values_duplicate',
  'value_types',
  'distribution_unsupported',
  'range_finite',
  'range_order',
  'log_uniform_positive',
  'range_integers',
  'quantum_distribution',
  'quantum_positive',
  'quantum_width',
  'grid_continuous',
  'grid_limit',
] as const;
export type SweepSpaceViolation = (typeof SWEEP_SPACE_VIOLATIONS)[number];

/** early_terminate が 422 sweep_early_terminate_invalid になった理由（応答の `reason`）。 */
export const SWEEP_EARLY_TERMINATE_VIOLATIONS = [
  'type_unsupported',
  'min_iter_positive',
  'eta_integer',
  'max_iter_order',
] as const;
export type SweepEarlyTerminateViolation = (typeof SWEEP_EARLY_TERMINATE_VIOLATIONS)[number];
export type SweepParameterValue = string | number | boolean;

/**
 * 探索する1つのparameter。`values`（1つを選ぶ）、`value`（定数）、min/maxつきの`distribution`の
 * ちょうど1つを持つ。log_uniformはmin/maxに値そのものを取る（W&Bのlog_uniform_values）。qは
 * q_uniformだけで使う。
 */
export type SweepParameterDefinition =
  | { values: SweepParameterValue[] }
  | { value: SweepParameterValue }
  | {
      distribution: 'uniform' | 'log_uniform' | 'int_uniform' | 'q_uniform';
      min: number;
      max: number;
      q?: number;
    };

export interface SweepObjective {
  /** Runのメトリクスの名前。stepの順に読む。 */
  metric: string;
  goal: 'minimize' | 'maximize';
  /** trialのメトリクスの履歴を1つの値にする方法。lastは最大のstepでの値。 */
  aggregation: 'last' | 'min' | 'max';
}

/** 非同期のHyperband（ASHA）: minIter×eta^kのstepにあるrungが、trialの上位1/etaを残す。 */
export interface SweepEarlyStopping {
  type: 'hyperband';
  minIter: number;
  eta: number;
  maxIter?: number;
}

export type SweepStatus = 'running' | 'paused' | 'finished' | 'canceled' | 'failed';

/**
 * Sweepが今のstatusになった理由。paused: user_requested、task_revision_changed（Sweepの作成後に
 * Taskが編集された）、owner_forbidden（作成者がもうProjectのeditorではない）、launch_failed
 * （trialをキューに入れられなかった）。finished: max_trials_reached、search_space_exhausted
 * （grid）。canceled: user_requested。failed: suggestion_failed。
 */
export type SweepStatusReason =
  | 'user_requested'
  | 'task_revision_changed'
  | 'owner_forbidden'
  | 'launch_failed'
  | 'max_trials_reached'
  | 'search_space_exhausted'
  | 'suggestion_failed';

export type SweepTrialState =
  | 'queued'
  | 'running'
  | 'finished'
  | 'failed'
  | 'canceled'
  | 'early_stopped';

export interface SweepTrial {
  id: string;
  sweepId: string;
  trialIndex: number;
  parameters: Record<string, SweepParameterValue>;
  runId: string;
  jobId: string;
  state: SweepTrialState;
  /** 集計した目的の値。実行中や、メトリクスが一度も有限でなかったときはnull。 */
  objectiveValue: number | null;
  objectiveStep: number | null;
  /** early_stoppedのとき: hyperbandのrung（例: "hyperband_rung_9"）。 */
  stopReason: string | null;
  runStatus: RunStatus;
  jobStatus: JobStatus;
  jobCancelRequested: boolean;
  createdAt: string;
  endedAt: string | null;
}

export type SweepTrialCounts = Record<SweepTrialState, number> & { total: number };

export interface Sweep {
  id: string;
  projectId: string;
  name: string;
  taskId: string;
  taskRevision: number;
  experimentId: string;
  method: SweepMethod;
  searchSpace: Record<string, SweepParameterDefinition>;
  objective: SweepObjective;
  maxTrials: number;
  parallelism: number;
  earlyStopping: SweepEarlyStopping | null;
  seed: number;
  /** nullならTaskのコンピュータとGPUを使う。 */
  targetId: string | null;
  gpuIds: string[] | null;
  status: SweepStatus;
  statusReason: SweepStatusReason | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  trialCounts: SweepTrialCounts;
  bestTrial: SweepTrial | null;
}

export interface SweepCreate {
  name: string;
  taskId: string;
  method: SweepMethod;
  searchSpace: Record<string, SweepParameterDefinition>;
  objective: { metric: string; goal: 'minimize' | 'maximize'; aggregation?: 'last' | 'min' | 'max' };
  maxTrials: number;
  parallelism?: number;
  earlyStopping?: SweepEarlyStopping | null;
  /** 0〜4294967295。省略時はサーバーが選んで返す。 */
  seed?: number;
  targetId?: string | null;
  gpuIds?: string[] | null;
}

export interface SweepPatch {
  maxTrials?: number;
  parallelism?: number;
}

export interface SweepCancel {
  /** trueなら実行中のtrialの取り消しも求める。queuedのtrialは常に取り消す。 */
  cancelRunningTrials: boolean;
}

export interface SweepPage {
  items: Sweep[];
  nextCursor: string | null;
}

export interface SweepTrialPage {
  items: SweepTrial[];
  nextCursor: string | null;
}
