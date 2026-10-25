import * as english from './en/comparison';
import { localized } from './localized';
// Runの比較の画面とCSVの書き出し。項目はrun-comparison-csv-exportが受け持つ。
export const comparisonText = localized({
  comparisonBaselineRun: '基準Run',
  comparisonNoBaseline: 'なし',
  comparisonBaselineMarker: '基準',
  comparisonOnlyDifferences: '差のある行だけ',
  comparisonDownloadCsv: 'CSVをダウンロード',
  comparisonModelVersion: 'モデルバージョン',
  comparisonDatasetVersions: '評価データセットバージョン',
  comparisonNoDifferences: '選んだRunの間に差のある行はありません',
  exportRunsCsv: '検索結果をCSV出力',
  exportingRunsCsv: 'CSVを作成しています…',
  exportRunsTruncated:
    '一致したRunが出力の上限を超えたため、途中で打ち切りました。CSVの末尾にも記載しています。',
} as const, english.comparisonText);

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const comparisonTextTemplates = localized({
  comparisonRunCountOutOfRange: (minimum: number, maximum: number) =>
    `比較するRunを${minimum}〜${maximum}件選んでください。`,
}, english.comparisonTextTemplates);
