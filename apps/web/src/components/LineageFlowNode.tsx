import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Link } from 'react-router-dom';
import type { LineageFlowNode as FlowNode } from '../types/lineage';
import { lineageNodeUrl } from '../lib/lineageNodeUrl';
import { shortenLineageLabel } from '../lib/lineageNodeLabel';
import { isJobStatus, JOB_STATUS_BADGE_CLASS } from '../lib/statusBadge';
import { useLocale } from '../i18n/useLocale';
import { lineageNodeKindLabels, text } from '../i18n/catalog';

// Matches the previous graph's readable label length and keeps a long name's identifying tail.
const NODE_LABEL_MAX_LENGTH = 28;

export function LineageFlowNode({ data, selected }: NodeProps<FlowNode>) {
  useLocale();
  const { node, projectId } = data;
  const status =
    node.status && Object.hasOwn(text, node.status)
      ? text[node.status as keyof typeof text]
      : node.status;
  return (
    <div className="lineage-node-card" data-kind={node.kind} data-selected={selected || undefined}>
      <Handle type="target" position={Position.Left} isConnectable={false} aria-hidden="true" />
      <div className="lineage-node-card__head">
        <span className="lineage-node-card__kind">{lineageNodeKindLabels[node.kind]}</span>
        {status && node.status && (
          <span
            className={`status-badge ${isJobStatus(node.status) ? JOB_STATUS_BADGE_CLASS[node.status] : 'status-neutral'}`}
          >
            {status}
          </span>
        )}
      </div>
      <Link
        className="lineage-node-card__title nodrag nopan"
        to={lineageNodeUrl(projectId, node)}
        title={node.label}
        aria-label={`${lineageNodeKindLabels[node.kind]}: ${node.label}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {shortenLineageLabel(node.label, NODE_LABEL_MAX_LENGTH)}
      </Link>
      <Handle type="source" position={Position.Right} isConnectable={false} aria-hidden="true" />
    </div>
  );
}
