import {
  RUN_COMPARISON_MAX_RUNS,
  RUN_COMPARISON_MIN_RUNS,
  type ComparedDatasetVersion,
  type ComparedModelVersion,
  type RunComparison,
  type RunComparisonNamespace,
  type RunComparisonValue,
} from '@mmt/contracts';
import { formatNumber, formatValue } from './format';
import { formatList } from '../i18n/textJoining';

// APIのCSVと同じラベル。画面とダウンロードしたファイルで、バージョンの呼び方をそろえる。
export const modelVersionLabel = (version: ComparedModelVersion) =>
  `${version.modelName}@${version.version}`;
export const datasetVersionLabel = (version: ComparedDatasetVersion) =>
  `${version.namespace ? `${version.namespace}/` : ''}${version.name}@${version.version}`;

export type ComparisonRowGroup = 'modelVersion' | 'datasetVersions' | RunComparisonNamespace;

export interface ComparisonCellDelta {
  delta: number | null;
  relativeDelta: number | null;
}

/** 表の1行。項目と、比べる順に並べたRunごとのセル。 */
export interface ComparisonTableRow {
  id: string;
  group: ComparisonRowGroup;
  /** パラメータ、メトリクス、タグのキー。グループ名をラベルにする参照の行では空。 */
  key: string;
  values: RunComparisonValue[];
  /** 基準Runを選んだとき、メトリクスの行にだけある。 */
  deltas?: ComparisonCellDelta[];
  differs: boolean;
}

/** URLのパラメータ`runs`にあるRunのID。重複を除き、順は保つ。 */
export function parseComparedRunIds(parameter: string | null): string[] {
  return [...new Set((parameter ?? '').split(',').filter(Boolean))];
}

export const isComparableRunCount = (count: number) =>
  count >= RUN_COMPARISON_MIN_RUNS && count <= RUN_COMPARISON_MAX_RUNS;

/** 基準Runは、比べているRunの1つである間だけ保つ。 */
export function chooseBaselineRunId(runIds: string[], parameter: string | null): string | null {
  return parameter && runIds.includes(parameter) ? parameter : null;
}

// キーが無いことはどの値とも異なるので、nullも値と同じように比較に加える。
export const valuesDiffer = (values: RunComparisonValue[]) =>
  new Set(values.map((value) => JSON.stringify(value))).size > 1;

function referenceRow(
  group: 'modelVersion' | 'datasetVersions',
  values: (string | null)[],
): ComparisonTableRow {
  return { id: group, group, key: '', values, differs: valuesDiffer(values) };
}

/**
 * 比較表のセル。メトリクスの数値は、差が見える有効数字6桁に丸め、1つの行が同じように読める
 * ようにする。パラメータとタグは記録されたとおりに出す。
 */
export function formatComparisonValue(group: ComparisonRowGroup, value: RunComparisonValue): string {
  return group === 'metrics' && typeof value === 'number' ? formatNumber(value) : formatValue(value);
}

/**
 * 比較表の行。各Runが使ったModelVersionと評価用のDatasetVersion、続いてAPIが並べた順の
 * パラメータ、メトリクス、タグ。
 */
export function buildComparisonTableRows(comparison: RunComparison): ComparisonTableRow[] {
  const modelVersions = new Map(comparison.modelVersions.map((version) => [version.id, version]));
  const datasetVersions = new Map(
    comparison.datasetVersions.map((version) => [version.id, version]),
  );
  const modelVersionCells = comparison.runs.map((run) => {
    if (!run.modelVersionId) return null;
    const version = modelVersions.get(run.modelVersionId);
    return version ? modelVersionLabel(version) : run.modelVersionId;
  });
  const datasetVersionCells = comparison.runs.map((run) =>
    run.inputDatasetVersionIds.length
      ? formatList(
          run.inputDatasetVersionIds.map((id) => {
            const version = datasetVersions.get(id);
            return version ? datasetVersionLabel(version) : id;
          }),
        )
      : null,
  );
  return [
    referenceRow('modelVersion', modelVersionCells),
    referenceRow('datasetVersions', datasetVersionCells),
    ...comparison.rows.map((row) => ({
      id: `${row.namespace}.${row.key}`,
      group: row.namespace,
      key: row.key,
      values: row.values,
      ...(row.deltaFromBaseline
        ? {
            deltas: row.deltaFromBaseline.map((delta, index) => ({
              delta,
              relativeDelta: row.relativeDeltaFromBaseline?.[index] ?? null,
            })),
          }
        : {}),
      differs: valuesDiffer(row.values),
    })),
  ];
}

export function filterComparisonRows(
  rows: ComparisonTableRow[],
  onlyDifferences: boolean,
): ComparisonTableRow[] {
  return onlyDifferences ? rows.filter((row) => row.differs) : rows;
}
