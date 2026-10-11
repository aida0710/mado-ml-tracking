import type { TargetDirectoryListingResult } from '@mmt/contracts';

// About a screenful of the candidate list; typing narrows the rest.
export const MAX_PATH_SUGGESTIONS = 50;

/** What a path field completes to: directories (a work directory) or executables (a Python). */
export type PathCompletionKind = 'directory' | 'executable';

/**
 * The directory part of a typed path (up to and including its last /) and the start of a name
 * in it. `/home/mmt/pro` is `/home/mmt/` and `pro`; a path without / has no directory.
 */
export function splitTypedPath(value: string): { directory: string; fragment: string } {
  const slash = value.lastIndexOf('/');
  if (slash < 0) return { directory: '', fragment: value };
  return { directory: value.slice(0, slash + 1), fragment: value.slice(slash + 1) };
}

/** A typed path that names a directory the computer can read: absolute or under ~/, ending in /. */
export function directoryToRead(value: string): string | null {
  const { directory } = splitTypedPath(value);
  if (!directory || !(directory.startsWith('/') || directory.startsWith('~/'))) return null;
  return directory;
}

/** Known paths that continue what is typed; all of them for an empty field. */
export function completeFromKnownPaths(paths: readonly string[], value: string): string[] {
  return paths.filter((path) => path.startsWith(value) && path !== value);
}

/**
 * The entries of a read directory that continue the typed name, as full paths in the form typed
 * (~/ stays ~/). Directories end with / so the next level can be read; executables are offered
 * for a Python. Hidden entries come only once a name starting with . is typed, as in a shell.
 */
export function completeFromListing(
  value: string,
  listing: TargetDirectoryListingResult,
  kind: PathCompletionKind,
): string[] {
  const { directory, fragment } = splitTypedPath(value);
  return listing.entries
    .filter(
      (entry) =>
        entry.name.startsWith(fragment) && (fragment.startsWith('.') || !entry.name.startsWith('.')),
    )
    .filter((entry) => entry.kind === 'directory' || (kind === 'executable' && entry.executable))
    .map((entry) => `${directory}${entry.name}${entry.kind === 'directory' ? '/' : ''}`);
}

/** Candidates in order without repeats, as many as the list shows. */
export function mergeSuggestions(...groups: string[][]): string[] {
  return [...new Set(groups.flat())].slice(0, MAX_PATH_SUGGESTIONS);
}
