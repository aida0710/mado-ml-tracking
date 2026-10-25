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

/** workerに読ませた1つのディレクトリについて、ダイアログが覚えている状態。 */
export type DirectoryListingState =
  | { status: 'loading' }
  | { status: 'read'; result: TargetDirectoryListingResult }
  // workerが答えなかった（どのworkerも受け取らなかったか、時間内に報告が無かった）。
  | { status: 'failed' };

/** 接続確認で見つかったパスと、その横に出す事実（空き容量、バージョン）。 */
export interface KnownPath {
  path: string;
  detail: string;
}

/** 接続確認で見つかった作業ディレクトリの候補と、書き込めるかどうか、空き容量。 */
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

/** 接続確認で見つかったPythonの候補と、そのバージョン。 */
export function knownPythonPaths(result: TargetCheckResult | null | undefined): KnownPath[] {
  return detectedPythons(result).map((python) => ({
    path: python.path,
    detail: python.version ?? text.pythonVersionUnknown,
  }));
}

/**
 * コンピュータ上のパスの欄の候補。接続確認で見つかったものと、workerが読んだあとの、打ち込んだ
 * ディレクトリの項目。`directoryToRequest`は、最後の/まで打ち込まれ、まだ依頼していない
 * ディレクトリを指す。呼び出し側がworkerにそれを読ませる（`canReadDirectories`のとき、つまり
 * コンピュータが保存済みでworkerを選んであるときだけ）。
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
  /** ディレクトリの読み取りについて分かっていること。依頼する前はundefined。 */
  listingOf: (directory: string) => DirectoryListingState | undefined;
}): FieldSuggestions & { directoryToRequest: string | null } {
  const details = Object.fromEntries(knownPaths.map((known) => [known.path, known.detail]));
  const fromCheck = completeFromKnownPaths(
    knownPaths.map((known) => known.path),
    value,
  );
  const directory = canReadDirectories ? directoryToRead(value) : null;
  const listing = directory ? listingOf(directory) : undefined;
  // /まで打ったパスだけがディレクトリを依頼する。名前を打っている途中は、読んだ結果を使う。
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
