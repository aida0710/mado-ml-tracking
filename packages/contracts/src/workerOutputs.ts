import type { JsonObject } from './index.js';

/** /mmt/outputsの下の1つのファイル。workerはRunのArtifactの`container/<path>`として保存する。 */
export interface ContainerResultArtifact {
  path: string;
  sha256: string;
  size: number;
  mimeType?: string;
}

export interface ContainerResultMetric {
  name: string;
  value: number;
  step?: number;
  timestamp?: string;
}

/** コンテナが作ったモデル。`path`は結果に挙げた出力ファイル。 */
export interface ContainerResultModel {
  path: string;
  /** Taskの出力モデルが保存先を決めるときは省略する。 */
  modelId?: string;
  metadata?: JsonObject;
}

/** コンテナが作ったデータセットバージョン。出力ファイル（`path`）か外部の`uri`のどちらか。 */
interface ContainerResultDatasetFields {
  datasetId: string;
  schema?: JsonObject;
  metadata?: JsonObject;
}

export type ContainerResultDataset = ContainerResultDatasetFields & (
  | { path: string; uri?: never; digest?: never }
  | { uri: string; digest: string; path?: never }
);

/**
 * /mmt/outputs/result.jsonのバージョン2。
 * `artifactsManifest`はJSON Lines形式の出力ファイルを指し、1行に1つContainerResultArtifactを
 * 書く。result.jsonに挙げきれないほど多い出力のためのもので、そのエントリは`artifacts`に加える。
 */
export interface ContainerResultV2 {
  version: 2;
  complete: true;
  artifacts?: ContainerResultArtifact[];
  artifactsManifest?: string;
  metrics?: ContainerResultMetric[];
  models?: ContainerResultModel[];
  datasets?: ContainerResultDataset[];
}

/**
 * `index`はRunの中で宣言を識別し、送り直しても安全にする。workerはresult.jsonの`models`に0から
 * 番号を振り、続けて`datasets`に振る（models.length + 位置）。
 */
export type WorkerOutputDeclaration =
  | ({ index: number; kind: 'model' } & ContainerResultModel)
  | ({ index: number; kind: 'dataset' } & ContainerResultDataset);

export interface WorkerOutputsRequest {
  version: 2;
  leaseId: string;
  declarations: WorkerOutputDeclaration[];
}

/** 1つの宣言に対して登録したバージョン。同じindexを送り直すと、保存済みの行を返す。 */
export interface RunOutputDeclaration {
  index: number;
  kind: 'model' | 'dataset';
  modelVersionId: string | null;
  datasetVersionId: string | null;
  createdAt: string;
}

export interface WorkerOutputsResponse {
  items: RunOutputDeclaration[];
}
