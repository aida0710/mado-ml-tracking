import { Link } from 'react-router-dom';
import type { ArtifactReferences } from '@mmt/contracts';
import { modelVersionPath } from '../lib/modelVersionPath';
import { text } from '../i18n/catalog';
import { artifactsTextTemplates } from '../i18n/artifacts';

/**
 * Every record that uses the Artifact, each a link to where it can be changed: model, dataset and
 * code versions, and Run checkpoints. The same list says why a file cannot be deleted.
 */
export function ArtifactReferenceLinks({
  projectId,
  references,
}: {
  projectId: string;
  references: ArtifactReferences;
}) {
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
    </ul>
  );
}
