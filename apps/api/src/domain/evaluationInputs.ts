import type { Run } from '@mmt/contracts';

/**
 * 評価のRunの入力には2つの役割がある。
 * - 上流の出力（Run.upstreamDatasetVersionIds）: 推論のRunの予測のように、上流のRunが作った
 *   DatasetVersion。モデルバージョンごとに違う。
 * - 正解セット（reference set）: それ以外のすべての入力。正解の書き起こしやテスト用の音声の
 *   ような固定の評価データ。MLflowのdataset contextに当たる。
 *
 * 2つの評価を比べられるのは、正解セットが等しいときだけ。上流の出力は必ず違うので、入力の
 * 一覧全体を比べると一致しない。upstreamDatasetVersionIdsは自動実行の連鎖
 * （automation-stage-chaining-api）が埋める。手で作ったRunでは空なので、入力のすべてが
 * 正解セットになる。
 */
export function referenceDatasetVersionIds(
  run: Pick<Run, 'inputDatasetVersionIds' | 'upstreamDatasetVersionIds'>,
): string[] {
  const upstream = new Set(run.upstreamDatasetVersionIds);
  return [...new Set(run.inputDatasetVersionIds.filter((id) => !upstream.has(id)))].sort();
}

