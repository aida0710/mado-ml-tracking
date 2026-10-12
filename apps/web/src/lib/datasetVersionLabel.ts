import type { DatasetVersion } from '@mmt/contracts';

/** A dataset version with its dataset's name, as the selectors list versions of several datasets. */
export function qualifiedDatasetVersionLabel(
  version: Pick<DatasetVersion, 'namespace' | 'name' | 'version'>,
): string {
  return `${version.namespace}/${version.name} / ${version.version}`;
}

/**
 * How a dataset version is named where it is referenced: its version alone inside its own dataset,
 * `namespace/name / version` (the selectors' form) for another dataset.
 */
export function datasetVersionLabel(version: DatasetVersion, shownDatasetId: string): string {
  if (version.datasetId === shownDatasetId) return version.version;
  return qualifiedDatasetVersionLabel(version);
}
