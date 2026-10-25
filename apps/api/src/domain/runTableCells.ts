import type {
  ComparedDatasetVersion,
  ComparedModelVersion,
  Run,
  RunComparisonValue,
} from '@mmt/contracts';

// 1つのセルに複数のDatasetVersionをつなぐ。どちらの文字もバージョンのラベルには現れない。
export const DATASET_VERSION_SEPARATOR = '; ';

/**
 * Runのparameterを表のセルにしたもの。ネイティブのparameterをSDKが記録した文字列より優先し、
 * 数値を数値のまま保つ。入れ子のオブジェクトと配列はJSONの文字列にする。
 */
export function getRunParameterCells(
  run: Pick<Run, 'parameters' | 'recordedParameters'>,
): Record<string, RunComparisonValue> {
  const merged = { ...run.recordedParameters, ...run.parameters };
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [
      key,
      value === null || typeof value !== 'object' ? value : JSON.stringify(value),
    ]),
  );
}

/**
 * PostgreSQLはlatest_metricsの有限でないdoubleを、JSONの文字列'NaN'・'Infinity'・'-Infinity'
 * として書く。これらは数値に戻す。それ以外はメトリクスの値ではない。
 */
export function parseMetricValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value === 'NaN' || value === 'Infinity' || value === '-Infinity') return Number(value);
  return null;
}

export const modelVersionLabel = (version: ComparedModelVersion) =>
  `${version.modelName}@${version.version}`;

export const datasetVersionLabel = (version: ComparedDatasetVersion) =>
  `${version.namespace ? `${version.namespace}/` : ''}${version.name}@${version.version}`;
