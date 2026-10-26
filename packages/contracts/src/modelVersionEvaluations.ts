import type { JsonObject, LatestMetricValue, Model, ModelVersion, RunKind, RunStatus } from './index.js';

/** GET /projects/:p/model-versions/:id: 1つのバージョンと、その登録モデル・alias。 */
export interface ModelVersionDetail {
  version: ModelVersion;
  model: Model;
  // 登録モデルのaliasのうち、このバージョンを指すもの。名前の順。
  aliases: string[];
}

/**
 * バージョンのページか、上流のRunから見たRun。automaticは自動実行がそのRunを作ったかを示す
 * （そのようなRunのJobを人が再試行したものも含む）。Runのタグは見ない。
 */
export interface AutomatedRunSummary {
  id: string;
  name: string;
  kind: RunKind;
  status: RunStatus;
  modelVersionId: string | null;
  codeVersionId: string | null;
  parentRunId: string | null;
  latestMetrics: Record<string, LatestMetricValue>;
  parameters: JsonObject;
  // 固定の評価データ（正解）。inputDatasetVersionIdsから上流の出力を除いたもの。
  referenceDatasetVersionIds: string[];
  // 上流のRunが作った入力。評価に渡す推論の出力など。
  upstreamDatasetVersionIds: string[];
  automatic: boolean;
  ruleId: string | null;
  executionId: string | null;
  // 自動実行のパイプラインの最初の段の実行。人が作ったRunではnull。
  pipelineRootExecutionId: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

/** GET /projects/:p/model-versions/:id/evaluations?kind=&limit=&cursor= */
export interface ModelVersionEvaluationSummary {
  modelVersionId: string;
  items: AutomatedRunSummary[];
  nextCursor: string | null;
}

/** GET /projects/:p/runs/:r/downstream?limit=&cursor=: parentRunIdがそのRunであるRun。 */
export interface RunDownstreamPage {
  runId: string;
  items: AutomatedRunSummary[];
  nextCursor: string | null;
}

// バージョンのページが、バージョンの結果として扱う（バージョンを作る側ではない）Runの種類。
export const MODEL_VERSION_RESULT_RUN_KINDS = ['inference', 'evaluation', 'processing'] as const;
export type ModelVersionResultRunKind = (typeof MODEL_VERSION_RESULT_RUN_KINDS)[number];
