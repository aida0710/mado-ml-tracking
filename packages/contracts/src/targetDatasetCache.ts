/**
 * workerが入力のDatasetVersionのファイルをコンピュータへ運ぶ方法。'relay': workerがAPIから
 * ダウンロードして転送する（GPUのホストはAPIに届かないことが多い）。'direct': コンピュータが
 * Job tokenで自らAPIからダウンロードする。
 */
export type DatasetTransferMode = 'relay' | 'direct';

export const DATASET_TRANSFER_MODES: readonly DatasetTransferMode[] = ['relay', 'direct'];

/** migrationの既定値と同じ。モデルの重みに加えて、よくある音声コーパスが入る大きさ。 */
export const DEFAULT_DATASET_CACHE_MAX_BYTES = 100 * 1024 ** 3;

/** これより小さいとキャッシュに小さな評価セットすら入らないので、ほぼ確実に打ち間違い。 */
export const MIN_DATASET_CACHE_MAX_BYTES = 1024 ** 2;
