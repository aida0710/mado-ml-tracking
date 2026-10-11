import * as english from './en/lineage';
import { localized } from './localized';
// Lineage graph: zoom controls of the diagram.
export const lineageText = localized({
  lineageZoomIn: '拡大',
  lineageZoomOut: '縮小',
  lineageZoomFit: '全体を表示',
  lineageZoomLevel: '表示倍率',
  lineageDiagramHint: 'ドラッグまたはスワイプで移動できます',
  lineageShowWhole: '全体を表示',
  lineageFocusMissing: '指定したものはLineageにありません。全体を表示しています。',
} as const, english.lineageText);

export const lineageTextTemplates = localized({
  lineageFocused: (label: string, depth: number) => `「${label}」の前後${depth}段だけを表示しています。`,
}, english.lineageTextTemplates);
