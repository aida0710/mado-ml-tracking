import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { Artifact, ArtifactReferences, Dataset } from '@mmt/contracts';
import { folderOfUploadPath } from '../lib/datasetFolderResume';
import { shortRunId } from '../lib/format';
import { modelVersionPath } from '../lib/modelVersionPath';
import { text } from '../i18n/catalog';
import { artifactsTextTemplates } from '../i18n/artifacts';

// The first owners name a file well enough in a table cell; the details list them all.
const SHOWN_OWNER_LIMIT = 2;

/**
 * What a catalog row belongs to, as a link: its Run, or for a file without a Run the dataset,
 * model or code versions that list it. A dataset file whose folder upload never became a version
 * still names its dataset, so it is not a dead end.
 */
export function ArtifactOwnerCell({
  artifact,
  runName,
  references,
  areReferencesChecked,
  datasets,
}: {
  artifact: Artifact;
  runName: string | undefined;
  references: ArtifactReferences | undefined;
  /** False while the file's references load: it is not yet known to belong to nothing. */
  areReferencesChecked: boolean;
  datasets: ReadonlyMap<string, Dataset>;
}) {
  useLocale();
  const base = `/projects/${encodeURIComponent(artifact.projectId)}`;
  if (artifact.runId)
    return (
      <Link to={`${base}/runs/${artifact.runId}?tab=artifacts`}>
        {runName ?? shortRunId(artifact.runId)}
      </Link>
    );
  if (!areReferencesChecked) return <span className="muted">{text.loading}</span>;
  const owners = [
    ...(references?.datasetVersions ?? []).map((version) => (
      <Link key={`dataset:${version.id}`} to={`${base}/datasets?id=${version.datasetId}&version=${version.id}`}>
        {artifactsTextTemplates.artifactDatasetOwner(version.datasetName)} / {version.version}
      </Link>
    )),
    ...(references?.modelVersions ?? []).map((version) => (
      <Link key={`model:${version.id}`} to={modelVersionPath(artifact.projectId, { modelId: version.modelId, versionId: version.id })}>
        {version.modelName} / {version.version}
      </Link>
    )),
    ...(references?.codeVersions ?? []).map((version) => (
      <Link key={`code:${version.id}`} to={`${base}/codes?version=${version.id}`}>
        {version.codeName} / {version.version}
      </Link>
    )),
  ];
  if (owners.length)
    return (
      <span className="artifact-owner-links">
        {owners.slice(0, SHOWN_OWNER_LIMIT)}
        {owners.length > SHOWN_OWNER_LIMIT && <span className="muted">+{owners.length - SHOWN_OWNER_LIMIT}</span>}
      </span>
    );
  const dataset = datasetOfUnfinishedUpload(artifact.path, datasets);
  if (dataset)
    return (
      <span className="artifact-owner-links">
        <Link to={`${base}/datasets?id=${dataset.id}`}>{artifactsTextTemplates.artifactDatasetOwner(dataset.name)}</Link>
        <span className="muted">{text.artifactUnfinishedFolderUpload}</span>
      </span>
    );
  return <span className="muted">{text.artifactNoRun}</span>;
}

/** The dataset whose folder upload stored this file, when the path is one of those uploads. */
function datasetOfUnfinishedUpload(path: string, datasets: ReadonlyMap<string, Dataset>): Dataset | null {
  const [, datasetId] = path.split('/');
  const dataset = datasetId ? datasets.get(datasetId) : undefined;
  return dataset && folderOfUploadPath(path, dataset.id) ? dataset : null;
}
