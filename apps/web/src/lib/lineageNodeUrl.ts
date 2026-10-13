import type { LineageNode } from '@mmt/contracts';

export function lineageNodeUrl(projectId: string, node: LineageNode): string {
  const base = `/projects/${projectId}`;
  if (node.kind === 'run') return `${base}/runs/${encodeURIComponent(node.id)}`;
  if (node.kind === 'loggedModel')
    return node.sourceRunId
      ? `${base}/runs/${encodeURIComponent(node.sourceRunId)}?tab=artifacts`
      : `${base}/artifacts`;
  const registry =
    node.kind === 'modelVersion' ? 'models' : node.kind === 'codeVersion' ? 'codes' : 'datasets';
  return `${base}/${registry}?version=${encodeURIComponent(node.id)}`;
}
