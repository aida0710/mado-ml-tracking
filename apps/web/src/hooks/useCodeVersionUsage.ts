import type { CodeVersion } from '@mmt/contracts';
import { automationApi } from '../api/automation';
import { registryApi } from '../api/registry';
import { tasksApi } from '../api/tasks';
import { findCodeVersionUsage } from '../lib/codeVersionUsage';
import { useQuery } from './useQuery';

/** The models a code version can run, and the Tasks and automation rules that chose it. */
export function useCodeVersionUsage(projectId: string, version: CodeVersion) {
  const sources = useQuery({ key: `${projectId}:code-version-usage-sources`, load: async (signal) => {
    const [models, tasks, rules] = await Promise.all([
      registryApi.models(projectId, signal),
      tasksApi.list(projectId, undefined, signal),
      automationApi.rules(projectId, signal),
    ]);
    return { models, tasks, rules };
  } });
  return {
    usage: sources.value ? findCodeVersionUsage({ version, ...sources.value }) : undefined,
    loading: sources.loading,
    error: sources.error,
    reload: sources.reload,
  };
}
