import * as english from './en/media';
import { localized } from './localized';
// stepごとに記録したメディア。Runのメディアのタブ、stepの比較、メディアの表。
// 項目はrun-media-webが受け持つ。
import type { RunMediaKind } from '@mmt/contracts';
import type { MediaTableCellFailure } from '../lib/mediaTableCells';
import { artifactReferenceErrorLabels, artifactsText } from './artifacts';

export const mediaText = localized({
  mediaKeys: 'メディアのキー',
  mediaKey: 'キー',
  mediaKind: '種類',
  mediaCount: '件数',
  mediaStepRange: 'step の範囲',
  mediaNoKeys: 'このRunにはstepごとのメディアが記録されていません。log_image・log_audio・log_table などで記録すると表示されます。',
  mediaStepSlider: '表示するstep',
  mediaPreviousStep: '前のstep',
  mediaNextStep: '次のstep',
  mediaStepHint: '矢印キーで前後のstep、Home・Endで最初と最後へ移動します。記録のあるstepだけに止まります。',
  mediaCaption: '説明',
  mediaTruncated: '記録が多いため、最初の10,000件だけを表示しています。',
  mediaCompareKey: '比較するキー',
  mediaCompareSteps: '比較するstep',
  mediaCompareLatestCommon: '全Runに共通する最新のstep',
  mediaCompareLatest: '各Runの最新step',
  mediaCompareNoStepsHint: 'どのstepも選ばないと、各Runの最新stepを1列に並べます。',
  mediaCompareNoCommonStep: '全Runに共通するstepが無いため、既定では各Runの最新stepを1列に並べます。',
  mediaCompareGrid: 'Run × step のメディア',
  mediaCompareMissing: 'なし',
  mediaCompareNoKeys:
    '選んだRunにはstepごとのメディアが記録されていません。log_audio・log_image などでstepを付けて記録したものが対象です。Runに保存したArtifactのファイルは［Artifacts］タブで並べられます。',
  mediaCompareHint:
    '矢印キーでセルを移動します。音声は同時に1つだけ鳴り、別のセルへ移ると同じ再生位置から続けて再生します。',
  mediaCompareNoSelection: 'セルを選ぶと、ここに表示します。',
  mediaRun: 'Run',
  mediaTablePagination: '表のページ',
  mediaCellPlay: '再生',
  mediaCellPause: '一時停止',
  mediaCellWaveform: '波形',
  mediaCellOpen: '開く',
  mediaCellClose: '閉じる',
} as const, english.mediaText);

export const mediaKindLabels: Record<RunMediaKind, string> = localized({
  audio: '音声',
  image: '画像',
  video: '動画',
  table: '表',
}, english.mediaKindLabels);

// 参照の決まりは評価サンプルの表（lib/evaluationSamples.ts）と同じなので、その文言を使い回す。
export const mediaCellErrorLabels: Record<MediaTableCellFailure, string> = localized({
  get empty() { return artifactReferenceErrorLabels.empty; },
  get absolute_path() { return artifactReferenceErrorLabels.absolute_path; },
  get parent_path() { return artifactReferenceErrorLabels.parent_path; },
  get unsupported_scheme() { return artifactReferenceErrorLabels.unsupported_scheme; },
  get invalid_run_reference() { return artifactReferenceErrorLabels.invalid_run_reference; },
  get other_project() { return artifactReferenceErrorLabels.other_project; },
  get not_found() { return artifactsText.evaluationAudioNotFound; },
  unresolved: 'Artifactに解決できませんでした',
}, english.mediaCellErrorLabels);

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const mediaTextTemplates = localized({
  mediaStepPosition: (step: number, index: number, count: number) => `step ${step}（${index} / ${count}）`,
  mediaStepLabel: (step: number) => `step ${step}`,
  /** 比較するRunのすべてが記録しているわけではないstepの横に出す。 */
  mediaStepRunCoverage: (runCount: number, totalRuns: number) => `${runCount}/${totalRuns} Run`,
  mediaStepRangeValue: (minStep: number, maxStep: number) => (minStep === maxStep ? `${minStep}` : `${minStep}〜${maxStep}`),
  mediaItemCount: (count: number) => `${count}件`,
  mediaCompareRecordedSteps: (count: number, minStep: number, maxStep: number) =>
    `記録のあるstep: ${count}個（${minStep}〜${maxStep}）`,
  mediaCompareEvenly: (count: number) => `均等に${count}列`,
  mediaCompareTooManyRuns: (maximum: number) => `メディアの比較は最初の${maximum}件のRunだけを表示しています。`,
  mediaCompareTooManySteps: (maximum: number) => `比較できるstepは${maximum}個までです。`,
  mediaCompareFirstOfMany: (count: number) => `このstepには${count}件あります。最初の1件を表示しています。`,
  mediaCompareCell: (runLabel: string, stepLabel: string, state: string) => `${runLabel}、${stepLabel}、${state}`,
  mediaTableRowCount: (count: number) => `${count}行`,
  mediaTableErrorCells: (count: number) => `表示できないセル ${count}件`,
  mediaTablePage: (page: number, pageCount: number) => `${page} / ${pageCount}ページ`,
}, english.mediaTextTemplates);
