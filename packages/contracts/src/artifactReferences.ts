/**
 * GET /projects/:p/artifact-references: 各Artifactを残している記録を名前つきで返す。画面が、
 * ファイルがどこで使われていて、なぜ削除できないかを示せるようにする。種類は、削除を
 * 409 artifact_in_useで拒むものと同じ。
 */
export interface ArtifactReferences {
  artifactId: string;
  modelVersions: Array<{ id: string; modelId: string; modelName: string; version: string }>;
  datasetVersions: Array<{
    id: string;
    datasetId: string;
    datasetName: string;
    version: string;
    /** バージョンの中でのファイルのパス。 */
    path: string;
  }>;
  codeVersions: Array<{ id: string; codeId: string; codeName: string; version: string }>;
  /** まだ保持しているcheckpointか、Runが続きを始めたcheckpoint。 */
  checkpoints: Array<{ id: string; runId: string; runName: string; step: number }>;
  /** 前処理のレポートがそのArtifactを確認用の見本に使っているときだけある。 */
  preprocessingReports?: Array<{ runId: string; runName: string }>;
}

/** 1リクエストで指定できるartifactIdsの最大数。ProjectのArtifactカタログの1ページ分。 */
export const ARTIFACT_REFERENCES_BATCH_LIMIT = 100;
