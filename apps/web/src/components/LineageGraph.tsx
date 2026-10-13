import type { ReactNode } from 'react';
import type { LineageGraph as Graph } from '@mmt/contracts';
import { narrowerThan } from '../lib/breakpoints';
import { useLineageInteraction } from '../hooks/useLineageInteraction';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Empty } from './Feedback';
import { LineageCanvas } from './LineageCanvas';
import { LineageGraphTools } from './LineageGraphTools';
import { LineageRelationsTable } from './LineageRelationsTable';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * The lineage diagram and its relations table. Below --bp-md the diagram is too small to read
 * first, so the relations table leads (open) and the diagram follows, fitted to the width.
 */
export function LineageGraph({
  graph,
  projectId,
  initialSelectedNodeId,
}: {
  graph: Graph;
  projectId: string;
  initialSelectedNodeId?: string | null;
}) {
  useLocale();
  const isNarrow = useMediaQuery(narrowerThan('md'));
  const interaction = useLineageInteraction({ graph, initialSelectedNodeId });
  if (!graph.nodes.length) return <Empty>{text.graphEmpty}</Empty>;
  return (
    <LineageGraphLayout
      isNarrow={isNarrow}
      diagram={
        <>
          <LineageGraphTools interaction={interaction} projectId={projectId} />
          <LineageCanvas
            graph={graph}
            projectId={projectId}
            isNarrow={isNarrow}
            selectedId={interaction.selectedId}
            direction={interaction.direction}
            onSelect={interaction.selectNode}
            onClearSelection={interaction.clearSelection}
          />
        </>
      }
      relations={
        <LineageRelationsTable graph={graph} projectId={projectId} initiallyOpen={isNarrow} />
      }
    />
  );
}

/** The order of the parts for a known width; LineageGraph passes the current one. */
export function LineageGraphLayout({
  isNarrow,
  diagram,
  relations,
}: {
  isNarrow: boolean;
  diagram: ReactNode;
  relations: ReactNode;
}) {
  useLocale();
  return (
    <div className={isNarrow ? 'lineage-graph narrow' : 'lineage-graph'}>
      <div className="lineage-legend">{text.graphLegend}</div>
      {isNarrow ? relations : diagram}
      {isNarrow ? diagram : relations}
    </div>
  );
}
