import type { Run } from '@mmt/contracts';
import { AUTOMATION_EXECUTION_PAGE_MAX, automationApi } from '../api/automation';
import { getModelTrainingSourceRunId } from '../lib/modelTrainingSource';
import { registryApi } from '../api/registry';
import { trackingApi } from '../api/tracking';
import { hasActiveExecution, hasActiveRun } from '../lib/automationActivity';
import { useQuery } from './useQuery';
import { useQueryPolledWhileActive } from './useQueryPolledWhileActive';

/** The version, its training Run, the Project's rules, and the version's automation executions. */
export function useModelVersionDetail(projectId: string, versionId: string) {
  const detail = useQuery({ key: `${projectId}:model-version:${versionId}`, load: (signal) =>
    registryApi.modelVersionDetail(projectId, versionId, signal),
  });
  const sourceRunId = detail.value ? getModelTrainingSourceRunId(detail.value.version) : null;
  const sourceRun = useQueryPolledWhileActive<Run>(
    sourceRunId ? `${projectId}:run:${sourceRunId}` : null,
    (signal) => trackingApi.run(projectId, sourceRunId!, signal),
    (run) => hasActiveRun([run]),
  );
  const rules = useQuery({ key: `${projectId}:automation-rules`, load: (signal) =>
    automationApi.rules(projectId, signal),
  });
  const executions = useQueryPolledWhileActive(
    `${projectId}:model-version:${versionId}:executions`,
    (signal) =>
      automationApi.executionPage(
        projectId,
        { filter: { modelVersionId: versionId }, limit: AUTOMATION_EXECUTION_PAGE_MAX },
        signal,
      ),
    (page) => hasActiveExecution(page.items),
  );
  return { detail, sourceRun, rules, executions };
}
