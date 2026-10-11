import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { LineageGraph, LineageNode } from '@mmt/contracts';
import { lineageNodeUrl } from '../lib/lineageLayout';
import { lineageNodeKindLabels, lineageRelationLabels, text } from '../i18n/catalog';

/**
 * Every relation of the graph as source → relation → target rows, folded under a summary. Each
 * end names its kind and links to its page, so the table works without the diagram.
 */
export function LineageRelationsTable({
  graph,
  projectId,
  initiallyOpen,
}: {
  graph: LineageGraph;
  projectId: string;
  initiallyOpen: boolean;
}) {
  useLocale();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return (
    <details className="graph-relations" open={initiallyOpen}>
      <summary>
        {text.relations} · {graph.edges.length}
      </summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{text.lineageEdgeSource}</th>
              <th>{text.relations}</th>
              <th>{text.lineageEdgeTarget}</th>
            </tr>
          </thead>
          <tbody>
            {graph.edges.map((edge, index) => (
              <tr key={index}>
                <td>
                  <RelationEnd node={nodeById.get(edge.source)} id={edge.source} projectId={projectId} />
                </td>
                <td className="nowrap">{lineageRelationLabels[edge.relation] ?? edge.relation}</td>
                <td>
                  <RelationEnd node={nodeById.get(edge.target)} id={edge.target} projectId={projectId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RelationEnd({ node, id, projectId }: { node: LineageNode | undefined; id: string; projectId: string }) {
  useLocale();
  if (!node) return <span className="mono">{id}</span>;
  return (
    <span className="lineage-relation-end">
      <span className="muted">{lineageNodeKindLabels[node.kind]}</span>
      <Link to={lineageNodeUrl(projectId, node)}>{node.label}</Link>
    </span>
  );
}
