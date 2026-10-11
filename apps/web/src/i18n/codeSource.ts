import * as english from './en/codeSource';
import { localized } from './localized';
// The read-only view of a saved code version's files on the Code page.
export const codeSourceText = localized({
  sourceHeading: 'ファイル',
  editedFiles: 'リポジトリの上で変更したファイル',
  noEditedFiles: 'リポジトリのファイルをそのまま使います（変更したファイルはありません）。',
  deletedFiles: '削除したファイル',
  noFiles: 'ファイルがありません。',
} as const, english.codeSourceText);
