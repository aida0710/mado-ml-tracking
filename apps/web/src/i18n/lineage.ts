import * as english from './en/lineage';
import { localized } from './localized';
// Lineage graph: zoom controls of the diagram.
export const lineageText = localized({
  lineageZoomIn: '拡大',
  lineageZoomOut: '縮小',
  lineageZoomFit: '全体を表示',
  lineageZoomLevel: '表示倍率',
  lineageDiagramHint: 'ドラッグまたはスワイプで移動できます',
} as const, english.lineageText);
