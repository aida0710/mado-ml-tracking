import { useCodeLanguage as useDesignSystemCodeLanguage, type CodeLanguageState } from '@mado/design-system/react';

// 利用者が選び直した形式を拡張子ごとに覚える保存キー。mado S3 Data Catalogの設定と分ける。
const CODE_LANGUAGE_STORAGE_KEY = 'mmt.codeLanguage';

/**
 * プレビューするテキストの形式（デザインシステムのuseCodeLanguage）。ファイル名・メディアタイプ・中身から
 * 判定し、利用者がこの種類のファイルに選び直した形式があればそれを使う。Artifactの名前とメディアタイプは
 * 無いことがあるので、ここで空として渡す。
 */
export function useCodeLanguage({
  fileName,
  mimeType,
  text,
}: {
  fileName?: string | null;
  mimeType?: string | null;
  text: string;
}): CodeLanguageState {
  return useDesignSystemCodeLanguage({
    storageKey: CODE_LANGUAGE_STORAGE_KEY,
    fileName: fileName ?? '',
    mimeType: mimeType ?? undefined,
    text,
  });
}
