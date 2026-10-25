import { Link } from 'react-router-dom';
import type { DatasetVersion, JobStatus } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useQuery } from '../hooks/useQuery';
import { LINEAGE_FOCUS_PARAMETER, runsUsingInput } from '../lib/lineageFocus';
import { Resource } from './Feedback';
import { StatusBadge } from './StatusBadge';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * データセットのバージョンの行き先。入力として使ったRunと、その周りの来歴。Lineageの画面が描くのと
 * 同じ関係を、Projectの来歴から読む。
 */
export function DatasetVersionUsage({ version }: { version: DatasetVersion }) {
  useLocale();
  const base = `/projects/${encodeURIComponent(version.projectId)}`;
  const lineage = useQuery({ key: `${version.projectId}:lineage`, load: (signal) =>
    trackingApi.lineage(version.projectId, signal),
  });
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
                  {/* RunのノードはRunの状態を持つ。 */}
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
