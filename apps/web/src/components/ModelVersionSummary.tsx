import { Link } from 'react-router-dom';
import type { AutomatedRunSummary, DatasetVersion, ModelVersionDetail, Run } from '@mmt/contracts';
import { CodeVersionNameLink } from './CodeVersionNameLink';
import { DetailsList } from './JsonDetails';
import { LineageGraph } from './LineageGraph';
import { ModelVersionArtifactLink } from './ModelVersionArtifactLink';
import { ModelVersionNameLink } from './ModelVersionNameLink';
import { StatusBadge } from './StatusBadge';
import { getModelTrainingSourceRunId } from '../lib/modelTrainingSource';
import { qualifiedDatasetVersionLabel } from '../lib/datasetVersionLabel';
import { formatDate } from '../lib/format';
import { buildModelVersionLineage, LINEAGE_RESULT_RUN_LIMIT } from '../lib/modelVersionLineage';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { lineageText } from '../i18n/lineage';
import { lineageFocusPath } from '../lib/lineageFocus';

/** The version's identity and where it came from, with the training → version → results band. */
export function ModelVersionSummary({
  projectId,
  detail,
  sourceRun,
  trainingDatasets = [],
  resultRuns,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  sourceRun: Run | undefined;
  trainingDatasets?: DatasetVersion[];
  resultRuns: AutomatedRunSummary[];
}) {
  useLocale();
  const { model, version, aliases } = detail;
  const sourceRunId = getModelTrainingSourceRunId(version);
  const base = `/projects/${projectId}`;
  const lineage = buildModelVersionLineage({
    model,
    version,
    sourceRun: sourceRun ?? null,
    datasetLabels: new Map(
      trainingDatasets.map((dataset) => [dataset.id, qualifiedDatasetVersionLabel(dataset)]),
    ),
    datasetParents: new Map(
      trainingDatasets.map((dataset) => [dataset.id, dataset.parentDatasetVersionIds]),
    ),
    resultRuns,
  });
  return (
    <section className="model-version-section" aria-label={text.modelVersionSummary}>
      <div className="model-version-summary">
        <DetailsList
          entries={[
            [
              text.modelVersionModel,
              <Link to={`${base}/models?version=${version.id}`}>{model.name}</Link>,
            ],
            [text.family, <span className="mono">{version.family}</span>],
            [
              text.modelVersionAliases,
              aliases.length ? (
                <span className="model-version-aliases">
                  {aliases.map((alias) => (
                    <span key={alias} className="model-version-alias mono">
                      {alias}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              ),
            ],
            [
              text.sourceRun,
              sourceRunId ? (
                <span>
                  <Link className="mono" to={`${base}/runs/${sourceRunId}`}>
                    {sourceRun?.name ?? sourceRunId}
                  </Link>{' '}
                  {sourceRun && <StatusBadge status={sourceRun.status} />}
                </span>
              ) : (
                '—'
              ),
            ],
            [
              text.parents,
              version.parentModelVersionIds.length
                ? version.parentModelVersionIds.map((id) => (
                    <ModelVersionNameLink key={id} projectId={projectId} versionId={id} />
                  ))
                : '—',
            ],
            [
              text.weightsUri,
              version.weightsUri ? (
                <span className="mono break-word">{version.weightsUri}</span>
              ) : (
                '—'
              ),
            ],
            [
              text.modelVersionWeightsArtifact,
              <ModelVersionArtifactLink projectId={projectId} version={version} />,
            ],
            [
              text.defaultCode,
              version.defaultCodeVersionId ? (
                <CodeVersionNameLink
                  projectId={projectId}
                  codeVersionId={version.defaultCodeVersionId}
                />
              ) : (
                '—'
              ),
            ],
            [text.created, formatDate(version.createdAt)],
          ]}
        />
      </div>
      <div className="section-heading">
        <h2>{text.modelVersionLineage}</h2>
        <Link className="button small" to={lineageFocusPath(projectId, version.id)}>
          {lineageText.lineageOpenModel}
        </Link>
      </div>
      <div className="model-version-lineage">
        <LineageGraph key={`${projectId}:${version.id}`} graph={lineage} projectId={projectId} />
      </div>
      {resultRuns.length > LINEAGE_RESULT_RUN_LIMIT && (
        <p className="muted">{text.modelVersionLineageTruncated}</p>
      )}
    </section>
  );
}
