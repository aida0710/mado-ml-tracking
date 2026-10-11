import { Link } from 'react-router-dom';
import { registryApi } from '../api/registry';
import { useQuery } from '../hooks/useQuery';
import { modelVersionPath } from '../lib/modelVersionPath';
import { formatModelVersionName } from '../lib/catalogOptions';

/**
 * A link to a model version's page by "model name / version", loaded on its own (as
 * CodeVersionNameLink does for code); the id stays until the name arrives, or if it cannot.
 */
export function ModelVersionNameLink({
  projectId,
  versionId,
}: {
  projectId: string;
  versionId: string;
}) {
  const detail = useQuery(`${projectId}:model-version:${versionId}`, (signal) =>
    registryApi.modelVersionDetail(projectId, versionId, signal),
  );
  if (!detail.value)
    return (
      <Link className="mono" to={`/projects/${projectId}/models?version=${versionId}`}>
        {versionId}
      </Link>
    );
  const { model, version } = detail.value;
  return (
    <Link
      className="version-link"
      title={versionId}
      to={modelVersionPath(projectId, { modelId: model.id, versionId })}
    >
      {formatModelVersionName(model.name, version.version)}
    </Link>
  );
}
