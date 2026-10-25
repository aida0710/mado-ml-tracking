import { useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { refreshPluginAvailability } from '../lib/pluginAvailabilityRevision';
import { getPluginConnectionsWithSavedResponses, getUnobservedPluginResponses } from '../lib/pluginConnectionResponses';
import { useQuery } from './useQuery';

export function usePluginConnections(projectId: string) {
  const query = useQuery({ key: `${projectId}:plugins`, load: (signal) => pluginsApi.connections(projectId, signal) });
  const [savedResponses, setSavedResponses] = useState<ReadonlyMap<string, PluginConnection>>(() => new Map());
  // GETがその保存した接続を返したら、レンダリング中に応答を捨てる。
  const unobservedResponses = query.value
    ? getUnobservedPluginResponses({ savedResponses, observedConnections: query.value })
    : savedResponses;
  if (unobservedResponses !== savedResponses) setSavedResponses(unobservedResponses);
  function onSaved(plugin: PluginConnection) {
    if (plugin.projectId !== projectId) return;
    // 各接続は、GETで見えるまで自分の応答を持つ。別の保存がそれを置き換えてはいけない。
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
      projectId, observedConnections: query.value, savedResponses: unobservedResponses,
    }),
    onSaved,
  };
}
