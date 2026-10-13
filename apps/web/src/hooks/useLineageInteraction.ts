import { useState } from 'react';
import type { LineageGraph } from '@mmt/contracts';
import type { LineageDirection, LineageInteractionState } from '../types/lineage';
import { searchLineageNodes } from '../lib/lineageInteraction';
import { useLocalizedMemo } from '../i18n/useLocalizedMemo';
import { lineageNodeKindLabels } from '../i18n/catalog';

export function useLineageInteraction({
  graph,
  initialSelectedNodeId,
}: {
  graph: LineageGraph;
  initialSelectedNodeId?: string | null;
}): LineageInteractionState {
  const [selection, setSelection] = useState(initialSelectedNodeId ?? '');
  const [direction, setDirection] = useState<LineageDirection>('both');
  const [query, setQuery] = useState('');
  const selectedNode = graph.nodes.find((node) => node.id === selection) ?? null;
  const searchResults = useLocalizedMemo(
    () =>
      searchLineageNodes({
        nodes: graph.nodes,
        query,
        kindLabels: lineageNodeKindLabels,
      }),
    [graph.nodes, query],
  );
  function selectNode(id: string) {
    setSelection(id);
    setQuery('');
  }
  return {
    selectedNode,
    selectedId: selectedNode?.id ?? '',
    direction,
    setDirection,
    query,
    setQuery,
    searchResults,
    selectNode,
    clearSelection: () => setSelection(''),
  };
}
