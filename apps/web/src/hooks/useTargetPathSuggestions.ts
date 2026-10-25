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
 * コンピュータの作業ディレクトリとPythonの欄の候補の引き方。`check`（終わった最新の確認）の候補と、
 * 入力したディレクトリについて選んだworkerが読んだもの。別の確認が終わるか読み込みが終わると
 * `refreshKey`が変わり、欄が値を問い合わせ直す。
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
