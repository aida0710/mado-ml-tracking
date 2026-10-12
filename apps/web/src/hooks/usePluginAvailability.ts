import { useSyncExternalStore } from 'react';
import { pluginsApi } from '../api/plugins';
import { getPluginAvailabilityRevision, subscribePluginAvailability } from '../lib/pluginAvailabilityRevision';
import { useQuery } from './useQuery';

export function usePluginAvailability(projectId: string) {
  const revision = useSyncExternalStore(
    subscribePluginAvailability,
    () => getPluginAvailabilityRevision(projectId),
  );
  return useQuery(`${projectId}:plugin-availability:${revision}`, (signal) =>
    pluginsApi.availability(projectId, signal),
  );
}
