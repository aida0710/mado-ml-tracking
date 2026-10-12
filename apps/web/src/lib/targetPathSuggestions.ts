import type { TargetCheckResult, TargetDirectoryListingResult } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { formatBytes } from './format';
import { detectedDirectories, detectedPythons } from './computerSetupValues';
import {
  completeFromKnownPaths,
  completeFromListing,
  directoryToRead,
  mergeSuggestions,
  type PathCompletionKind,
} from './targetPathCompletion';
import { directoryListingOutcomeNotes } from '../i18n/computerSetup';
import { text, textTemplates } from '../i18n/catalog';

/** One directory a worker was asked to read, as the dialog remembers it. */
export type DirectoryListingState =
  | { status: 'loading' }
  | { status: 'read'; result: TargetDirectoryListingResult }
  // The worker never answered (no claim, or no report in time).
  | { status: 'failed' };

/** A path the check found, with the fact shown beside it (free space, a version). */
export interface KnownPath {
  path: string;
  detail: string;
}

/** Work directory candidates of a check, with whether they are writable and their free space. */
export function knownDirectoryPaths(result: TargetCheckResult | null | undefined): KnownPath[] {
  return detectedDirectories(result).map((directory) => ({
    path: directory.path,
    detail: directory.writable
      ? [
          text.directoryWritable,
          ...(directory.freeBytes === null
            ? []
            : [textTemplates.directoryFree(formatBytes(directory.freeBytes))]),
        ].join(' · ')
      : text.directoryNotWritable,
  }));
}

/** Python candidates of a check, with their versions. */
export function knownPythonPaths(result: TargetCheckResult | null | undefined): KnownPath[] {
  return detectedPythons(result).map((python) => ({
    path: python.path,
    detail: python.version ?? text.pythonVersionUnknown,
  }));
}

/**
 * The candidates of a path field on the computer: what the check found, and the entries of the
 * typed directory once a worker has read it. `directoryToRequest` names a directory that is typed
 * up to its last / and has not been asked for yet; the caller asks a worker to read it (only when
 * `canReadDirectories`: the computer is saved and a worker is chosen).
 */
export function targetPathSuggestions({
  value,
  kind,
  knownPaths,
  canReadDirectories,
  listingOf,
}: {
  value: string;
  kind: PathCompletionKind;
  knownPaths: readonly KnownPath[];
  canReadDirectories: boolean;
  /** What is known of reading a directory, undefined before it is asked for. */
  listingOf: (directory: string) => DirectoryListingState | undefined;
}): FieldSuggestions & { directoryToRequest: string | null } {
  const details = Object.fromEntries(knownPaths.map((known) => [known.path, known.detail]));
  const fromCheck = completeFromKnownPaths(
    knownPaths.map((known) => known.path),
    value,
  );
  const directory = canReadDirectories ? directoryToRead(value) : null;
  const listing = directory ? listingOf(directory) : undefined;
  // Only a path typed up to a / asks for the directory; a name being typed uses what was read.
  const directoryToRequest = directory && !listing && value.endsWith('/') ? directory : null;
  if (directoryToRequest || listing?.status === 'loading')
    return {
      items: mergeSuggestions(fromCheck),
      details,
      note: text.directoryListingLoading,
      directoryToRequest,
    };
  if (listing?.status === 'failed')
    return {
      items: mergeSuggestions(fromCheck),
      details,
      note: text.directoryListingFailed,
      directoryToRequest: null,
    };
  if (listing?.status === 'read') {
    const { result } = listing;
    const note =
      result.outcome !== 'ok'
        ? directoryListingOutcomeNotes[result.outcome]
        : result.truncated
          ? text.directoryListingTruncated
          : undefined;
    return {
      items: mergeSuggestions(completeFromListing(value, result, kind), fromCheck),
      details,
      ...(note ? { note } : {}),
      directoryToRequest: null,
    };
  }
  return { items: mergeSuggestions(fromCheck), details, directoryToRequest: null };
}
