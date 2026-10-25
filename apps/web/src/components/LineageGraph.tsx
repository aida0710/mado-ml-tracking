import type { ReactNode } from 'react';
import type { LineageGraph as Graph } from '@mmt/contracts';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';
import { useLineageInteraction } from '../hooks/useLineageInteraction';
import { Empty } from './Feedback';
import { LineageCanvas } from './LineageCanvas';
import { LineageGraphTools } from './LineageGraphTools';
import { LineageRelationsTable } from './LineageRelationsTable';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 来歴の図と関係の表。900px未満では図が小さすぎて最初に読むには向かないので、関係の表を先に
 * （開いて）置き、図は幅に合わせてその後に置く。
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

/** 幅が分かっているときの部品の並び。LineageGraphが今の幅を渡す。 */
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
