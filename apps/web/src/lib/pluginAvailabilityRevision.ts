const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

export function getPluginAvailabilityRevision(projectId: string): number {
  return revisions.get(projectId) ?? 0;
}

export function subscribePluginAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Every mounted dataset action refreshes after a connection is saved or toggled. */
export function refreshPluginAvailability(projectId: string): void {
  revisions.set(projectId, getPluginAvailabilityRevision(projectId) + 1);
  for (const listener of listeners) listener();
}
