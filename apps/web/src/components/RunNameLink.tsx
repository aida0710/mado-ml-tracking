import { Link } from 'react-router-dom';
import { trackingApi } from '../api/tracking';
import { useQuery } from '../hooks/useQuery';

/** Runへの名前のリンク。名前は自分で読み込み、届くまで、または失敗したらidのまま表示する。 */
export function RunNameLink({ projectId, runId }: { projectId: string; runId: string }) {
  const run = useQuery({ key: `${projectId}:run:${runId}`, load: (signal) =>
    trackingApi.run(projectId, runId, signal),
  });
  return (
    <Link to={`/projects/${projectId}/runs/${runId}`} title={runId}>
      {run.value?.name ?? runId}
    </Link>
  );
}
