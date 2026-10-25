import { useMemo, type CSSProperties } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeChange,
} from '@xyflow/react';
import type { LineageCanvasProps, LineageFlowNode } from '../types/lineage';
import { toLineageFlowElements } from '../lib/lineageGraphModel';
import { layoutLineage } from '../lib/lineageLayout';
import { traceLineagePath } from '../lib/lineageInteraction';
import { useLineageViewport } from '../hooks/useLineageViewport';
import { useLocalizedMemo } from '../i18n/useLocalizedMemo';
import { lineageNodeKindLabels, lineageRelationLabels, text } from '../i18n/catalog';
import { lineageText } from '../i18n/lineage';
import { LineageFlowNode as FlowNode } from './LineageFlowNode';
import { LineageFlowEdge as FlowEdge } from './LineageFlowEdge';

const nodeTypes = { lineage: FlowNode };
const edgeTypes = { lineage: FlowEdge };
// 初期の全体表示、狭い画面でも読める表示、拡大縮小の範囲、概観に切り替えるしきい値を
// mado S3 Data Catalogに合わせる。
const WIDE_FIT_VIEW = { padding: 0.2, maxZoom: 1.15 };
const NARROW_FIT_VIEW = { ...WIDE_FIT_VIEW, minZoom: 0.5 };
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 2;
const MINIMAP_NODE_THRESHOLD = 8;
const BACKGROUND_DOT_GAP = 22;
const BACKGROUND_DOT_SIZE = 1;
// markerを別にし、強調した線の矢印も線と同じテーマの色になるようにする。
const PATH_MARKER_COLOR = 'var(--link)';

function Canvas({
  graph,
  projectId,
  selectedId,
  direction,
  isNarrow,
  onSelect,
  onClearSelection,
}: LineageCanvasProps) {
  const layout = useMemo(
    () => layoutLineage(toLineageFlowElements({ graph, projectId })),
    [graph, projectId],
  );
  const graphKey = JSON.stringify([graph.nodes.map((node) => node.id), graph.edges]);
  useLineageViewport({ graphKey, selectedId });
  const elements = useLocalizedMemo(() => {
    const path = selectedId ? traceLineagePath({ ...layout, selectedId, direction }) : null;
    return {
      nodes: layout.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        ariaLabel: `${lineageNodeKindLabels[node.data.node.kind]}: ${node.data.node.label}`,
        className: path
          ? path.nodeIds.has(node.id)
            ? 'lineage-flow-node--path'
            : 'lineage-flow-node--muted'
          : undefined,
      })),
      edges: layout.edges.map((edge) => {
        const onPath = path?.edgeIds.has(edge.id) ?? false;
        return {
          ...edge,
          ariaLabel: lineageRelationLabels[edge.data!.relation] ?? edge.data!.relation,
          className: path
            ? onPath
              ? 'lineage-flow-edge--path'
              : 'lineage-flow-edge--muted'
            : undefined,
          markerEnd:
            onPath && typeof edge.markerEnd === 'object'
              ? { ...edge.markerEnd, color: PATH_MARKER_COLOR }
              : edge.markerEnd,
        };
      }),
    };
  }, [layout, selectedId, direction]);
  const ariaLabels = useLocalizedMemo(
    () => ({
      'controls.ariaLabel': lineageText.lineageGraphControls,
      'controls.zoomIn.ariaLabel': lineageText.lineageZoomIn,
      'controls.zoomOut.ariaLabel': lineageText.lineageZoomOut,
      'controls.fitView.ariaLabel': lineageText.lineageZoomFit,
      'minimap.ariaLabel': lineageText.lineageOverview,
      'node.a11yDescription.default': lineageText.lineageNodeHelp,
      'node.a11yDescription.keyboardDisabled': lineageText.lineageNodeHelp,
      'edge.a11yDescription.default': lineageText.lineageRelationHelp,
    }),
    [],
  );

  function changeSelection(changes: NodeChange<LineageFlowNode>[]) {
    const selections = changes.filter((change) => change.type === 'select');
    const selected = selections.findLast((change) => change.selected);
    if (selected) onSelect(selected.id);
    else if (selections.some((change) => change.id === selectedId)) onClearSelection();
  }

  return (
    <div
      className="lineage-canvas"
      role="group"
      aria-label={text.lineage}
      style={{ '--lineage-content-height': `${layout.height}px` } as CSSProperties}
    >
      <ReactFlow<LineageFlowNode>
        key={graphKey}
        {...elements}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={onClearSelection}
        onNodesChange={changeSelection}
        nodesConnectable={false}
        nodesDraggable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        defaultMarkerColor={null}
        fitView
        fitViewOptions={isNarrow ? NARROW_FIT_VIEW : WIDE_FIT_VIEW}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        ariaLabelConfig={ariaLabels}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={BACKGROUND_DOT_GAP}
          size={BACKGROUND_DOT_SIZE}
        />
        <Controls showInteractive={false} />
        {elements.nodes.length > MINIMAP_NODE_THRESHOLD && (
          <MiniMap<LineageFlowNode>
            pannable
            zoomable
            nodeClassName={(node) => `lineage-minimap-node--${node.data.node.kind}`}
          />
        )}
      </ReactFlow>
    </div>
  );
}

export function LineageCanvas(props: LineageCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
