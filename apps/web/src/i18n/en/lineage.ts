import { formatEnglishCount } from '../formatEnglishCount';
export const lineageText = {
  lineageZoomIn: 'Zoom in',
  lineageZoomOut: 'Zoom out',
  lineageZoomFit: 'Fit to view',
  lineageGraphControls: 'Lineage graph controls',
  lineageOverview: 'Graph overview',
  lineageSearch: 'Search graph',
  lineageSearchPlaceholder: 'Search datasets, Runs, models or code',
  lineageSearchResults: 'Graph search results',
  lineageSearchEmpty: 'No matching items',
  lineageDirection: 'Traversal direction from the selected item',
  both: 'Both',
  upstream: 'Upstream',
  downstream: 'Downstream',
  lineageOpenDetails: 'Open details',
  lineageClearSelection: 'Clear selection',
  lineageNodeHelp: 'Press Enter to select an item. Follow its name link to open details.',
  lineageRelationHelp: 'A relationship between items. It is also available in the relations table.',
  // Leaves the focus on one item; unlike lineageZoomFit, it changes which items are drawn.
  lineageShowWhole: 'Show full graph',
  lineageFocusMissing: 'The specified item is not in Lineage. Showing the full graph.',
} as const;

export const lineageTextTemplates = {
  lineageMoreResults: (count: number) => formatEnglishCount(count, 'more item'),
  lineageFocused: (label: string, depth: number) =>
    `Showing only items within ${formatEnglishCount(depth, 'level')} of “${label}”.`,
};
