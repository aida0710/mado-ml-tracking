import { Link } from 'react-router-dom';
import { registryApi } from '../api/registry';
import { useQuery } from '../hooks/useQuery';
import { useDatasetVersionsById } from '../hooks/useDatasetVersionsById';
import { datasetVersionLabel } from '../lib/datasetVersionLabel';

// No dataset is "the shown one" here, so every version is named with its dataset.
const NO_SHOWN_DATASET = '';

/**
 * Links to dataset versions by "namespace/name / version". The API has no lookup by version id,
 * so the Project's datasets are read and their versions searched; the id stays until then.
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
  // The versions are looked up once the datasets are known; before that the ids are shown.
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
