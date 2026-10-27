import type { Run } from '@mmt/contracts';
import { trackingApi } from '../../api/tracking';
import { useQuery } from '../../hooks/useQuery';
import { ProjectBreadcrumb } from '../ProjectBreadcrumb';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * Runの位置を示す。Project、Experimentsの画面、続いてRunのExperimentの名前で、後ろの2つはリンク。
 * 名前はProjectのExperimentの一覧から取り、届くまで最後のリンクは"Runs"と出す。
 */
export function RunBreadcrumb({ run }: { run: Pick<Run, 'projectId' | 'experimentId'> }) {
  useLocale();
  const experiments = useQuery({ key: `${run.projectId}:experiments`, load: (signal) =>
    trackingApi.experiments(run.projectId, signal),
  });
  const experimentName = experiments.value?.find((item) => item.id === run.experimentId)?.name;
  const experimentsPath = `/projects/${run.projectId}/experiments`;
  return (
    <ProjectBreadcrumb
      parents={[
        { to: experimentsPath, label: text.experiments },
        { to: `${experimentsPath}?experiment=${run.experimentId}`, label: experimentName ?? text.runs },
      ]}
    />
  );
}
