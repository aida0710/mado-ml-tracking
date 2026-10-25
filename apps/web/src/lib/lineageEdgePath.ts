import type { LineagePoint } from '../types/lineage';

/** Dagreの通過点を使うと、階層を飛ばす辺が間にあるノードを避ける。 */
export function lineageEdgePath(points: LineagePoint[]): string {
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
