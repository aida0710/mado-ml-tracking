import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { DatasetVersion, JobStatus } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useQuery } from '../hooks/useQuery';
import { LINEAGE_FOCUS_PARAMETER, runsUsingInput } from '../lib/lineageFocus';
import { Resource } from './Feedback';
import { StatusBadge } from './StatusBadge';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Where a dataset version went: the Runs that took it as an input, and the Lineage around it.
 * Read from the Project's lineage, the same relations the Lineage page draws.
 */
export function DatasetVersionUsage({ version }: { version: DatasetVersion }) {
  useLocale();
  const base = `/projects/${encodeURIComponent(version.projectId)}`;
  const lineage = useQuery(`${version.projectId}:lineage`, (signal) =>
    trackingApi.lineage(version.projectId, signal),
  );
  return (
    <section className="dataset-version-usage" data-testid="dataset-version-usage">
      <div className="section-heading">
        <h3>{text.datasetVersionInputRuns}</h3>
        <Link className="button small" to={`${base}/lineage?${LINEAGE_FOCUS_PARAMETER}=${encodeURIComponent(version.id)}`}>
          {text.datasetVersionShowLineage}
        </Link>
      </div>
      <Resource query={lineage}>
        {(graph) => {
          const runs = runsUsingInput(graph, version.id);
          return runs.length ? (
            <ul className="dataset-version-runs">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link to={`${base}/runs/${encodeURIComponent(run.id)}`}>{run.label}</Link>
                  {/* Run nodes carry the Run's status. */}
                  {run.status && <StatusBadge status={run.status as JobStatus} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{textTemplates.datasetVersionNoInputRuns(version.version)}</p>
          );
        }}
      </Resource>
    </section>
  );
}
