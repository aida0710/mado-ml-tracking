import * as english from './en/lineage';
import { localized } from './localized';
// Lineage navigation, search and path selection.
export const lineageText = localized({
  lineageZoomIn: '拡大',
  lineageZoomOut: '縮小',
  lineageZoomFit: '全体を表示',
  lineageGraphControls: 'Lineageの表示操作',
  lineageOverview: 'グラフの全体図',
  lineageSearch: 'グラフ内を検索',
  lineageSearchPlaceholder: 'データセット・Run・モデル・コードを検索',
  lineageSearchResults: 'グラフ内の検索結果',
  lineageSearchEmpty: '一致する項目はありません',
  lineageDirection: '選択した項目から辿る方向',
  both: '前後',
  upstream: '生成元',
  downstream: '生成先',
  lineageOpenDetails: '詳細を開く',
  lineageClearSelection: '選択を解除',
  lineageNodeHelp: 'Enterで項目を選択します。名前のリンクから詳細を開けます。',
  lineageRelationHelp: '項目間の関係です。関係一覧でも確認できます。',
  lineageShowWhole: '全体を表示',
  lineageFocusMissing: '指定したものはLineageにありません。全体を表示しています。',
} as const, english.lineageText);

export const lineageTextTemplates = localized({
  lineageMoreResults: (count: number) => `ほか${count}件`,
  lineageFocused: (label: string, depth: number) => `「${label}」の前後${depth}段だけを表示しています。`,
}, english.lineageTextTemplates);
