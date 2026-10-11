/**
 * The navigation state left by archiving a Project from its settings: "/" then shows the Project
 * list with a note, rather than opening another Project by itself.
 */
export interface ArchivedProjectState {
  archivedProjectName: string;
}

export function readArchivedProjectName(state: unknown): string | null {
  const name = (state as Partial<ArchivedProjectState> | null)?.archivedProjectName;
  return typeof name === 'string' ? name : null;
}
