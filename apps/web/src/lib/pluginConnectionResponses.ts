import type { PluginConnection } from '@mmt/contracts';

function isSavedConnectionObserved(
  saved: PluginConnection,
  observed: PluginConnection | undefined,
): boolean {
  if (!observed || observed.projectId !== saved.projectId) return false;
  if (observed.configRevision > saved.configRevision) return true;
  return (
    observed.configRevision === saved.configRevision &&
    observed.enabled === saved.enabled &&
    observed.name === saved.name &&
    observed.configurationStatus === saved.configurationStatus
  );
}

export function getUnobservedPluginResponses({
  savedResponses,
  observedConnections,
}: {
  savedResponses: ReadonlyMap<string, PluginConnection>;
  observedConnections: readonly PluginConnection[];
}): ReadonlyMap<string, PluginConnection> {
  const observedById = new Map(
    observedConnections.map((connection) => [connection.id, connection]),
  );
  const unobserved = new Map(savedResponses);
  for (const [id, saved] of savedResponses) {
    if (isSavedConnectionObserved(saved, observedById.get(id))) unobserved.delete(id);
  }
  return unobserved.size === savedResponses.size ? savedResponses : unobserved;
}

export function getPluginConnectionsWithSavedResponses({
  projectId,
  observedConnections,
  savedResponses,
}: {
  projectId: string;
  observedConnections: readonly PluginConnection[];
  savedResponses: ReadonlyMap<string, PluginConnection>;
}): PluginConnection[] {
  const connections = new Map(
    observedConnections
      .filter((connection) => connection.projectId === projectId)
      .map((connection) => [connection.id, connection]),
  );
  for (const [id, saved] of savedResponses) {
    if (saved.projectId === projectId && !isSavedConnectionObserved(saved, connections.get(id))) {
      connections.set(id, saved);
    }
  }
  return [...connections.values()];
}
