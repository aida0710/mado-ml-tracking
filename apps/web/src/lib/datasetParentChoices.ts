// The [親のバージョン] choices of a new dataset version: this dataset's versions first, and its
// latest version already checked, since a new version usually follows the one before it.
import type { DatasetVersion } from '@mmt/contracts';
import type { SelectOption } from '../types/form';
import { datasetVersionLabel } from './datasetVersionLabel';

export function datasetParentChoices(
  versions: readonly DatasetVersion[],
  datasetId: string,
): { options: SelectOption[]; defaultParentIds: string[] } {
  const newestFirst = [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const own = newestFirst.filter((version) => version.datasetId === datasetId);
  const others = newestFirst.filter((version) => version.datasetId !== datasetId);
  return {
    options: [...own, ...others].map((version) => ({
      value: version.id,
      label: datasetVersionLabel(version, datasetId),
    })),
    defaultParentIds: own[0] ? [own[0].id] : [],
  };
}
