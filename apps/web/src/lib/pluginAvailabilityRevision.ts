const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

export function getPluginAvailabilityRevision(projectId: string): number {
  return revisions.get(projectId) ?? 0;
}

export function subscribePluginAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 接続の保存や有効・無効の切り替えの後、表示中のデータセットの操作をすべて更新する。 */
export function refreshPluginAvailability(projectId: string): void {
  revisions.set(projectId, getPluginAvailabilityRevision(projectId) + 1);
  for (const listener of listeners) listener();
}
