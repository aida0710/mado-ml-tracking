import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { LineageFlowNode } from '../types/lineage';

// mado S3 Data Catalogの、選んだ項目に寄せる表示に合わせつつ、ラベルを読める大きさに保つ。
const SELECTION_FIT_VIEW = { padding: 1.1, minZoom: 0.9, maxZoom: 1.35, duration: 350 };

export function useLineageViewport({ graphKey, selectedId }: { graphKey: string; selectedId: string }) {
  const { fitView } = useReactFlow<LineageFlowNode>();
  const focusedSelection = useRef('');
  useEffect(() => {
    if (!selectedId) {
      focusedSelection.current = '';
      return;
    }
    const focusKey = `${graphKey}:${selectedId}`;
    if (focusedSelection.current === focusKey) return;
    const frame = requestAnimationFrame(() => {
      focusedSelection.current = focusKey;
      void fitView({ ...SELECTION_FIT_VIEW, nodes: [{ id: selectedId }] });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, graphKey, selectedId]);
}
