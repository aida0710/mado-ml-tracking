import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { trackingApi } from '../../api/tracking';
import { useQuery } from '../../hooks/useQuery';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * Where a Run sits: the Experiments page, then the Run's Experiment by name, both links. The name
 * comes from the Project's Experiment list; until it arrives the second link reads "Runs".
 */
export function RunBreadcrumb({ run }: { run: Pick<Run, 'projectId' | 'experimentId'> }) {
  useLocale();
  const experiments = useQuery(`${run.projectId}:experiments`, (signal) =>
    trackingApi.experiments(run.projectId, signal),
  );
  const experimentName = experiments.value?.find((item) => item.id === run.experimentId)?.name;
  const experimentsPath = `/projects/${run.projectId}/experiments`;
  return (
    <>
      <Link to={experimentsPath}>{text.experiments}</Link>
      <span className="breadcrumb-separator">/</span>
      <Link to={`${experimentsPath}?experiment=${run.experimentId}`}>
        {experimentName ?? text.runs}
      </Link>
    </>
  );
}
