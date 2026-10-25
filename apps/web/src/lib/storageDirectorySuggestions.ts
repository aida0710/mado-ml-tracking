import type { DirectorySuggestions } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { text, textTemplates } from '../i18n/catalog';

/**
 * ルートディレクトリの欄の候補と注記。まだ無いパスに注記を出すのは補完できる候補も無いときだけで、
 * 既存の名前を途中まで打っている間は何も出さない。
 */
export function toDirectoryFieldSuggestions(directories: DirectorySuggestions): FieldSuggestions {
  return { items: directories.items, note: directoryNote(directories) };
}

function directoryNote({
  status,
  resolvedPath,
  items,
  truncated,
}: DirectorySuggestions): string | undefined {
  if (status === 'not_directory') return textTemplates.storageDirectoryNotDirectory(resolvedPath);
  if (status === 'unavailable') return textTemplates.storageDirectoryUnavailable(resolvedPath);
  if (status === 'missing' && items.length === 0)
    return textTemplates.storageDirectoryMissing(resolvedPath);
  if (truncated) return text.storageDirectoryTruncated;
  return undefined;
}
