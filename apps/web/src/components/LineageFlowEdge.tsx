import { BaseEdge, type EdgeProps } from '@xyflow/react';
import type { LineageFlowEdge as FlowEdge } from '../types/lineage';
import { lineageEdgePath } from '../lib/lineageEdgePath';
import { lineageRelationLabels } from '../i18n/catalog';
import { useLocale } from '../i18n/useLocale';

export function LineageFlowEdge({ id, data, markerEnd, style }: EdgeProps<FlowEdge>) {
  useLocale();
  return (
    <>
      <title>{lineageRelationLabels[data?.relation ?? ''] ?? data?.relation}</title>
      <BaseEdge
        id={id}
        path={lineageEdgePath(data?.points ?? [])}
        markerEnd={markerEnd}
        style={style}
      />
    </>
  );
}
