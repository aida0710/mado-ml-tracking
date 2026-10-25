import * as english from './en/codeSource';
import { localized } from './localized';
// Codeの画面の、保存したコードバージョンのファイルを読むだけの表示。
export const codeSourceText = localized({
  sourceHeading: 'ファイル',
  editedFiles: 'リポジトリの上で変更したファイル',
  noEditedFiles: 'リポジトリのファイルをそのまま使います（変更したファイルはありません）。',
  deletedFiles: '削除したファイル',
  noFiles: 'ファイルがありません。',
} as const, english.codeSourceText);
