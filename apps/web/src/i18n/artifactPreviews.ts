// Previews of Artifacts: server-generated audio previews, the format of text previews, the table
// view of CSV / TSV / jsonl, the head of large text, and the image size toggle.
export const artifactPreviewsText = {
  audioServerPreviewPending: '64MiBを超えるため、サーバーで波形とスペクトログラムを生成しています。再生はできます。',
  audioServerPreviewFailed: 'サーバーでの波形とスペクトログラムの生成に失敗しました。再生はできます。',
  audioServerPreviewNote: 'サーバーで生成した全体の波形とスペクトログラム（線形）です。拡大・チャンネル選択・melは使えません。',
  // The format a text preview is colored as (CodeView), and the table view of CSV / TSV / jsonl.
  codeFormat: '表示形式',
  codeFormatText: 'テキスト',
  codeFormatLog: 'ログ',
  previewFormatTable: '表',
  // Image previews: fitted to the preview by default, or drawn pixel for pixel.
  imageShowActualSize: '原寸で表示',
  imageFitToFrame: '枠に合わせる',
};

export const artifactPreviewsTextTemplates = {
  codeFormatAuto: (format: string) => `自動（${format}）`,
  // A text file over the preview limit shows only its head; the download is next to this note.
  previewTextHead: (shownSize: string, totalSize: string) =>
    `先頭の${shownSize}だけを表示しています（全体 ${totalSize}）。`,
  previewTableTooLarge: (limitSize: string) => `${limitSize}を超えるため、表にはせずテキストで表示しています。`,
  tabularTableSize: (rowCount: number, columnCount: number) =>
    `${rowCount.toLocaleString('ja-JP')}行 · ${columnCount.toLocaleString('ja-JP')}列`,
  tabularTableTruncated: (shownRowCount: number, rowCount: number) =>
    `全${rowCount.toLocaleString('ja-JP')}行のうち、先頭の${shownRowCount.toLocaleString('ja-JP')}行を表示しています。並べ替えはすべての行が対象です。`,
  tabularSortBy: (column: string) => `${column}で並べ替え`,
  imageSize: (width: number, height: number) =>
    `${width.toLocaleString('ja-JP')} × ${height.toLocaleString('ja-JP')} px`,
  audioVisibleRange: (start: string, end: string) => `表示範囲 ${start}–${end}`,
};
