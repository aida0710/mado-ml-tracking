import { useEffect, useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { refreshPluginAvailability } from '../lib/pluginAvailabilityRevision';
import { useQuery } from './useQuery';

export function usePluginConnections(projectId: string) {
  const query = useQuery(`${projectId}:plugins`, (signal) => pluginsApi.connections(projectId, signal));
  const [saved, setSaved] = useState<PluginConnection | null>(null);
  const visibleSaved = saved?.projectId === projectId ? saved : null;
  const fetched = query.value?.find((plugin) => plugin.id === saved?.id);
  useEffect(() => {
    if (saved && fetched && (
      fetched.configRevision > saved.configRevision ||
      (fetched.configRevision === saved.configRevision && fetched.enabled === saved.enabled &&
        fetched.name === saved.name && fetched.configurationStatus === saved.configurationStatus)
    )) setSaved(null);
  }, [saved, fetched]);
  function onSaved(plugin: PluginConnection) {
    // Use the PATCH response immediately; an older GET must not keep import actions usable.
    setSaved(plugin);
    refreshPluginAvailability(projectId);
    query.reload();
  }
  return {
    ...query,
    value: visibleSaved && query.value
      ? [...query.value.filter((plugin) => plugin.id !== visibleSaved.id), visibleSaved]
      : query.value,
    onSaved,
  };
}
