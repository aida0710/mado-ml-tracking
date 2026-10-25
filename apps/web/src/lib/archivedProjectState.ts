/**
 * 設定からProjectをアーカイブしたときに残すナビゲーションのstate。"/"では、ほかのProjectを
 * 勝手に開かず、注記付きのProjectの一覧を出す。
 */
export interface ArchivedProjectState {
  archivedProjectName: string;
}

export function readArchivedProjectName(state: unknown): string | null {
  const name = (state as Partial<ArchivedProjectState> | null)?.archivedProjectName;
  return typeof name === 'string' ? name : null;
}
