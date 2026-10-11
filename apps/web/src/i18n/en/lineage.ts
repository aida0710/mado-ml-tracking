import { formatEnglishCount } from '../formatEnglishCount';
export const lineageText = {
  lineageZoomIn: "Zoom in",
  lineageZoomOut: "Zoom out",
  lineageZoomFit: "Fit to view",
  lineageZoomLevel: "Zoom level",
  lineageDiagramHint: "Drag or swipe to pan",
  // Leaves the focus on one item; unlike lineageZoomFit, it changes which items are drawn.
  lineageShowWhole: "Show full graph",
  lineageFocusMissing: "The specified item is not in Lineage. Showing the full graph.",
} as const;

export const lineageTextTemplates = {
  lineageFocused: (label: string, depth: number) =>
    `Showing only items within ${formatEnglishCount(depth, 'level')} of “${label}”.`,
};
