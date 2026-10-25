import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { ArtifactReferences } from '@mmt/contracts';
import { modelVersionPath } from '../lib/modelVersionPath';
import { text } from '../i18n/catalog';
import { artifactsTextTemplates } from '../i18n/artifacts';
import { workflowsText } from '../i18n/workflows';

/**
 * Artifactを使っているすべての記録。モデルバージョン、データセットのバージョン、コードバージョン、
 * Runのcheckpointを、それぞれ変更できる場所へのリンクで示す。同じ一覧が、ファイルを削除できない
 * 理由の説明にもなる。
 */
export function ArtifactReferenceLinks({
  projectId,
  references,
}: {
  projectId: string;
  references: ArtifactReferences;
}) {
  useLocale();
  const base = `/projects/${encodeURIComponent(projectId)}`;
  return (
    <ul className="artifact-reference-links" data-testid="artifact-reference-links">
      {references.modelVersions.map((version) => (
        <li key={`model:${version.id}`}>
          <span className="muted">{text.artifactUsedByModelVersion}</span>{' '}
          <Link to={modelVersionPath(projectId, { modelId: version.modelId, versionId: version.id })}>
            {version.modelName} / {version.version}
          </Link>
        </li>
      ))}
      {references.datasetVersions.map((version) => (
        <li key={`dataset:${version.id}:${version.path}`}>
          <span className="muted">{text.artifactUsedByDatasetVersion}</span>{' '}
          <Link to={`${base}/datasets?id=${version.datasetId}&version=${version.id}`}>
            {version.datasetName} / {version.version}
          </Link>{' '}
          <span className="mono muted break-word">{version.path}</span>
        </li>
      ))}
      {references.codeVersions.map((version) => (
        <li key={`code:${version.id}`}>
          <span className="muted">{text.artifactUsedByCodeVersion}</span>{' '}
          <Link to={`${base}/codes?version=${version.id}`}>
            {version.codeName} / {version.version}
          </Link>
        </li>
      ))}
      {references.checkpoints.map((checkpoint) => (
        <li key={`checkpoint:${checkpoint.id}`}>
          <span className="muted">{text.artifactUsedByCheckpoint}</span>{' '}
          <Link to={`${base}/runs/${checkpoint.runId}?tab=checkpoints`}>
            {artifactsTextTemplates.artifactCheckpointLabel(checkpoint.runName, checkpoint.step)}
          </Link>
        </li>
      ))}
      {references.preprocessingReports?.map((report) => (
        <li key={`preprocessing:${report.runId}`}>
          <span className="muted">{workflowsText.preprocessingReport}</span>{' '}
          <Link to={`${base}/runs/${report.runId}?tab=details`}>{report.runName}</Link>
        </li>
      ))}
    </ul>
  );
}
