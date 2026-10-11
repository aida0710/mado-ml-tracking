import * as english from './en/artifactPreviews';
import { localized } from './localized';
// Server-generated previews of audio too large for browser analysis, and the format of text previews.
export const artifactPreviewsText = localized({
  audioServerPreviewPending: '64MiBを超えるため、サーバーで波形とスペクトログラムを生成しています。再生はできます。',
  audioServerPreviewFailed: 'サーバーでの波形とスペクトログラムの生成に失敗しました。再生はできます。',
  audioServerPreviewNote: 'サーバーで生成した全体の波形とスペクトログラム（線形）です。拡大・チャンネル選択・melは使えません。',
  // The format a text preview is colored as (CodeView).
  codeFormat: '表示形式',
  codeFormatText: 'テキスト',
  codeFormatLog: 'ログ',
}, english.artifactPreviewsText);

export const artifactPreviewsTextTemplates = localized({
  codeFormatAuto: (format: string) => `自動（${format}）`,
}, english.artifactPreviewsTextTemplates);
