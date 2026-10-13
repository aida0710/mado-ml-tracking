import type { LineageGraph, LineageNode } from '@mmt/contracts';
import type { Edge, Node } from '@xyflow/react';

export interface LineagePoint {
  x: number;
  y: number;
}

export type LineageFlowNode = Node<
  {
    node: LineageNode;
    projectId: string;
  },
  'lineage'
>;

export type LineageFlowEdge = Edge<
  {
    relation: string;
    points: LineagePoint[];
  },
  'lineage'
>;

export interface LineageFlowElements {
  nodes: LineageFlowNode[];
  edges: LineageFlowEdge[];
}

export interface LineageFlowLayout extends LineageFlowElements {
  width: number;
  height: number;
}

export type LineageDirection = 'both' | 'upstream' | 'downstream';

export interface LineagePathSelection {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export interface LineageInteractionState {
  selectedNode: LineageNode | null;
  selectedId: string;
  direction: LineageDirection;
  setDirection: (direction: LineageDirection) => void;
  query: string;
  setQuery: (query: string) => void;
  searchResults: LineageNode[];
  selectNode: (id: string) => void;
  clearSelection: () => void;
}

export interface LineageCanvasProps {
  graph: LineageGraph;
  projectId: string;
  selectedId: string;
  direction: LineageDirection;
  isNarrow: boolean;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
}
