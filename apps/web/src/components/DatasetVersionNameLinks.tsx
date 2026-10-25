import { Link } from 'react-router-dom';
import { registryApi } from '../api/registry';
import { useQuery } from '../hooks/useQuery';
import { useDatasetVersionsById } from '../hooks/useDatasetVersionsById';
import { datasetVersionLabel } from '../lib/datasetVersionLabel';

// ここでは「表示中のデータセット」が無いので、どのバージョンにもデータセット名を添える。
const NO_SHOWN_DATASET = '';

/**
 * データセットのバージョンへの「namespace/name / version」のリンク。APIにはバージョンのidで
 * 引く手段が無いので、Projectのデータセットを読んでそのバージョンを探す。それまではidを表示する。
 */
export function DatasetVersionNameLinks({
  projectId,
  versionIds,
}: {
  projectId: string;
  versionIds: readonly string[];
}) {
  const datasets = useQuery({ key: versionIds.length ? `${projectId}:datasets` : null, load: (signal) =>
    registryApi.datasets(projectId, signal),
  });
  // データセットが分かってからバージョンを探す。それまではidを表示する。
  const versions = useDatasetVersionsById({
    projectId,
    ids: datasets.value ? versionIds : [],
    loadedVersions: [],
    datasets: datasets.value ?? [],
  });
  return (
    <>
      {versionIds.map((id) => {
        const version = versions.get(id);
        return (
          <Link
            key={id}
            className={version ? 'version-link' : 'version-link mono'}
            title={id}
            to={`/projects/${projectId}/datasets?version=${id}`}
          >
            {version ? datasetVersionLabel(version, NO_SHOWN_DATASET) : id}
          </Link>
        );
      })}
    </>
  );
}
