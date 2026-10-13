import type { LineagePoint } from '../types/lineage';

/** Dagre's passage points keep edges that skip a rank away from its intervening nodes. */
export function lineageEdgePath(points: LineagePoint[]): string {
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
