// ネイティブAPIのJSONの本文の上限。app.tsが適用し、OpenAPIのドキュメントが公開する。

// registryのJSONやコードのアップロードには、ストリームで受けるArtifactの本文とは別の上限をかける。
export const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;
// オフラインのsyncのバッチは、1つのJSONの本文に最大10000件のメトリクスと10000行のログを持つ。
export const SYNC_BATCH_MAX_BYTES = 32 * 1024 * 1024;
// DatasetVersionはMAX_DATASET_VERSION_FILES個までのファイルを、それぞれ1024文字までのパスで
// 挙げる（Artifact IDと合わせて1件約1.1 KB）。そのため作成のリクエストのJSONの上限は大きくする。
export const MAX_DATASET_VERSION_BODY_BYTES = 128 * 1024 * 1024;
