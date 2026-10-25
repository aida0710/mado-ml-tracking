import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { trackingApi } from '../../api/tracking';
import { useQuery } from '../../hooks/useQuery';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * Runの位置を示す。Experimentsの画面、続いてRunのExperimentの名前で、どちらもリンク。名前は
 * ProjectのExperimentの一覧から取り、届くまで2つ目のリンクは"Runs"と出す。
 */
export function RunBreadcrumb({ run }: { run: Pick<Run, 'projectId' | 'experimentId'> }) {
  useLocale();
  const experiments = useQuery({ key: `${run.projectId}:experiments`, load: (signal) =>
    trackingApi.experiments(run.projectId, signal),
  });
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
