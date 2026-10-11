import type { TargetCheck } from '@mmt/contracts';
import type { FieldSuggestions, SuggestFieldValues } from '../types/form';
import type { PathCompletionKind } from '../lib/targetPathCompletion';
import {
  knownDirectoryPaths,
  knownPythonPaths,
  targetPathSuggestions,
  type KnownPath,
} from '../lib/targetPathSuggestions';
import type { useTargetDirectoryListings } from './useTargetDirectoryListings';

/**
 * The lookups of the work directory and Python fields of a computer: the candidates of `check` (the
 * newest finished one), and what the chosen worker reads of a typed directory. `refreshKey`
 * changes when another check finishes or a reading ends, so the fields look their values up again.
 */
export function useTargetPathSuggestions({
  check,
  listings,
}: {
  check: TargetCheck | undefined;
  listings: ReturnType<typeof useTargetDirectoryListings>;
}) {
  const result = check?.result;
  function suggestPaths(kind: PathCompletionKind, knownPaths: KnownPath[]): SuggestFieldValues {
    return async (value: string): Promise<FieldSuggestions> => {
      const { directoryToRequest, ...suggestions } = targetPathSuggestions({
        value,
        kind,
        knownPaths,
        canReadDirectories: listings.isAvailable,
        listingOf: listings.listingOf,
      });
      if (directoryToRequest) listings.request(directoryToRequest);
      return suggestions;
    };
  }
  return {
    suggestWorkDirectory: suggestPaths('directory', knownDirectoryPaths(result)),
    suggestPython: suggestPaths('executable', knownPythonPaths(result)),
    refreshKey: `${check?.id ?? ''}:${listings.version}`,
  };
}
