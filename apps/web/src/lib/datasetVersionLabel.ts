import type { DatasetVersion } from '@mmt/contracts';

/** データセットの名前を付けたバージョン名。選択欄で複数のデータセットのバージョンを並べるときの形。 */
export function qualifiedDatasetVersionLabel(
  version: Pick<DatasetVersion, 'namespace' | 'name' | 'version'>,
): string {
  return `${version.namespace}/${version.name} / ${version.version}`;
}

/**
 * 参照する場所でのデータセットのバージョンの呼び方。そのデータセットの中ではバージョンだけ、
 * 別のデータセットでは`namespace/name / version`（選択欄と同じ形）。
 */
export function datasetVersionLabel(version: DatasetVersion, shownDatasetId: string): string {
  if (version.datasetId === shownDatasetId) return version.version;
  return qualifiedDatasetVersionLabel(version);
}
