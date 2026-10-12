import { useEffect, useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { refreshPluginAvailability } from '../lib/pluginAvailabilityRevision';
import { getPluginConnectionsWithSavedResponses, getUnobservedPluginResponses } from '../lib/pluginConnectionResponses';
import { useQuery } from './useQuery';

export function usePluginConnections(projectId: string) {
  const query = useQuery(`${projectId}:plugins`, (signal) => pluginsApi.connections(projectId, signal));
  const [savedResponses, setSavedResponses] = useState<ReadonlyMap<string, PluginConnection>>(() => new Map());
  useEffect(() => {
    const observedConnections = query.value;
    if (!observedConnections) return;
    setSavedResponses((previous) => getUnobservedPluginResponses({
      savedResponses: previous, observedConnections,
    }));
  }, [query.value, savedResponses]);
  function onSaved(plugin: PluginConnection) {
    if (plugin.projectId !== projectId) return;
    // Each connection keeps its response until GET observes it; another save must not replace it.
    setSavedResponses((previous) => {
      const saved = previous.get(plugin.id);
      if (saved && saved.configRevision > plugin.configRevision) return previous;
      return new Map(previous).set(plugin.id, plugin);
    });
    refreshPluginAvailability(projectId);
    query.reload();
  }
  return {
    ...query,
    value: query.value === undefined ? undefined : getPluginConnectionsWithSavedResponses({
      projectId, observedConnections: query.value, savedResponses,
    }),
    onSaved,
  };
}
