import { Link } from 'react-router-dom';
import { registryApi } from '../api/registry';
import { useQuery } from '../hooks/useQuery';
import { modelVersionPath } from '../lib/modelVersionPath';
import { formatModelVersionName } from '../lib/catalogOptions';

/**
 * モデルバージョンのページへの「<モデル名> / <バージョン>」のリンク。名前は自分で読み込む
 * （CodeVersionNameLinkがコードでするのと同じ）。名前が届くまで、または届かなければidのまま
 * 表示する。
 */
export function ModelVersionNameLink({
  projectId,
  versionId,
}: {
  projectId: string;
  versionId: string;
}) {
  const detail = useQuery({ key: `${projectId}:model-version:${versionId}`, load: (signal) =>
    registryApi.modelVersionDetail(projectId, versionId, signal),
  });
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
