/** The ends of a sideways scrolling box that hide content, as its data attribute writes them. */
export type HiddenEdges = 'start' | 'end' | 'both' | null;

// Sub-pixel layout can leave scrollLeft a fraction short of either end; that is not hidden content.
const EDGE_TOLERANCE_PX = 1;

export function hiddenEdges({
  scrollLeft,
  clientWidth,
  scrollWidth,
}: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): HiddenEdges {
  const hidesStart = scrollLeft > EDGE_TOLERANCE_PX;
  const hidesEnd = scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX;
  if (hidesStart && hidesEnd) return 'both';
  if (hidesStart) return 'start';
  return hidesEnd ? 'end' : null;
}

/**
 * The scrollLeft that brings an item into view with `margin` to spare from each edge (where a
 * hidden end fades out), moving as little as possible. An item already clear of both edges keeps
 * the current position; one wider than the space between the margins lines up its start.
 * Positions are in the box's content: itemStart is the item's distance from the content's left.
 */
export function scrollLeftToReveal({
  itemStart,
  itemEnd,
  scrollLeft,
  clientWidth,
  margin,
}: {
  itemStart: number;
  itemEnd: number;
  scrollLeft: number;
  clientWidth: number;
  margin: number;
}): number {
  const viewStart = scrollLeft + margin;
  const viewEnd = scrollLeft + clientWidth - margin;
  if (itemStart < viewStart || itemEnd - itemStart > viewEnd - viewStart)
    return Math.max(0, itemStart - margin);
  if (itemEnd > viewEnd) return itemEnd + margin - clientWidth;
  return scrollLeft;
}
