import { Link } from 'react-router-dom';
import type { ModelVersion } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useQuery } from '../hooks/useQuery';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * バージョンの重みのArtifactを保存したパスで示し、ダウンロードのリンクと、そのバージョンで絞り込んだ
 * Artifactsの画面へのリンクを添える。Artifactを読み込む間はidを表示する。
 */
export function ModelVersionArtifactLink({
  projectId,
  version,
}: {
  projectId: string;
  version: Pick<ModelVersion, 'id' | 'modelId' | 'artifactId'>;
}) {
  useLocale();
  const artifactId = version.artifactId;
  const artifact = useQuery({ key: artifactId ? `${projectId}:artifact:${artifactId}` : null, load: (signal) =>
    trackingApi.artifact(projectId, artifactId!, signal),
  });
  if (!artifactId) return <>—</>;
  const catalogUrl = `/projects/${projectId}/artifacts?modelId=${encodeURIComponent(
    version.modelId,
  )}&modelVersionId=${encodeURIComponent(version.id)}`;
  return (
    <span className="model-version-artifact">
      <a
        className="mono break-word"
        href={trackingApi.artifactUrl(projectId, artifactId)}
        title={artifactId}
        download={artifact.value?.path.split('/').pop()}
      >
        {artifact.value?.path ?? artifactId}
      </a>{' '}
      <Link className="button small" to={catalogUrl}>
        {text.modelVersionArtifactOpen}
      </Link>
    </span>
  );
}
