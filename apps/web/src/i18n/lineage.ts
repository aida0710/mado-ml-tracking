// Lineage graph: zoom controls of the diagram.
export const lineageText = {
  lineageZoomIn: '拡大',
  lineageZoomOut: '縮小',
  lineageZoomFit: '全体を表示',
  lineageZoomLevel: '表示倍率',
  lineageDiagramHint: 'ドラッグまたはスワイプで移動できます',
  lineageShowWhole: '全体を表示',
  lineageFocusMissing: '指定したものはLineageにありません。全体を表示しています。',
} as const;

export const lineageTextTemplates = {
  lineageFocused: (label: string, depth: number) => `「${label}」の前後${depth}段だけを表示しています。`,
};
