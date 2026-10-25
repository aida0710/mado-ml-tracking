import { intlLocaleOf } from '@mado/design-system/locale';
import * as english from './en/artifactPreviews';
import { localized } from './localized';
// Artifactのプレビュー。サーバーで生成する音声のプレビュー、テキストのプレビューの表示形式、
// CSV / TSV / jsonlの表の表示、大きなテキストの先頭、画像の大きさの切り替え。
export const artifactPreviewsText = localized({
  audioServerPreviewPending: '64MiBを超えるため、サーバーで波形とスペクトログラムを生成しています。再生はできます。',
  audioServerPreviewFailed: 'サーバーでの波形とスペクトログラムの生成に失敗しました。再生はできます。',
  audioServerPreviewNote: 'サーバーで生成した全体の波形とスペクトログラム（線形）です。拡大・チャンネル選択・melは使えません。',
  // テキストのプレビューをどの形式として色分けするか（CodeView）と、CSV / TSV / jsonlの表の表示。
  codeFormat: '表示形式',
  codeFormatText: 'テキスト',
  codeFormatLog: 'ログ',
  previewFormatTable: '表',
  // 画像のプレビュー。既定ではプレビューの枠に合わせ、原寸（ピクセル等倍）でも描ける。
  imageShowActualSize: '原寸で表示',
  imageFitToFrame: '枠に合わせる',
}, english.artifactPreviewsText);

export const artifactPreviewsTextTemplates = localized({
  codeFormatAuto: (format: string) => `自動（${format}）`,
  // プレビューの上限を超えるテキストファイルは先頭だけを出す。ダウンロードはこの注記の隣にある。
  previewTextHead: (shownSize: string, totalSize: string) =>
    `先頭の${shownSize}だけを表示しています（全体 ${totalSize}）。`,
  previewTableTooLarge: (limitSize: string) => `${limitSize}を超えるため、表にはせずテキストで表示しています。`,
  tabularTableSize: (rowCount: number, columnCount: number) =>
    `${rowCount.toLocaleString(intlLocaleOf('ja'))}行 · ${columnCount.toLocaleString(intlLocaleOf('ja'))}列`,
  tabularTableTruncated: (shownRowCount: number, rowCount: number) =>
    `全${rowCount.toLocaleString(intlLocaleOf('ja'))}行のうち、先頭の${shownRowCount.toLocaleString(intlLocaleOf('ja'))}行を表示しています。並べ替えはすべての行が対象です。`,
  tabularSortBy: (column: string) => `${column}で並べ替え`,
  imageSize: (width: number, height: number) =>
    `${width.toLocaleString(intlLocaleOf('ja'))} × ${height.toLocaleString(intlLocaleOf('ja'))} px`,
  audioVisibleRange: (start: string, end: string) => `表示範囲 ${start}–${end}`,
}, english.artifactPreviewsTextTemplates);
