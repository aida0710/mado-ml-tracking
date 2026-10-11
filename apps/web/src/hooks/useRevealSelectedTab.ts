import { useLayoutEffect, useRef, type RefObject } from 'react';
import { scrollLeftToReveal } from '../lib/horizontalScroll';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Scrolls a tab list sideways so the selected tab is in view, `margin` clear of the edges, whenever
 * the selection changes: a tab opened from the URL, tapped while half cut off, or chosen by keys.
 * Opening the screen jumps there; later changes glide unless the user asked for less motion.
 */
export function useRevealSelectedTab(
  listRef: RefObject<HTMLElement | null>,
  selectedIndex: number,
  margin: number,
) {
  const hasRevealed = useRef(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelectorAll('[role="tab"]')[selectedIndex];
    if (!list || !tab) return;
    const listLeft = list.getBoundingClientRect().left;
    const tabBox = tab.getBoundingClientRect();
    const itemStart = tabBox.left - listLeft + list.scrollLeft;
    const left = scrollLeftToReveal({
      itemStart,
      itemEnd: itemStart + tabBox.width,
      scrollLeft: list.scrollLeft,
      clientWidth: list.clientWidth,
      margin,
    });
    const glides = hasRevealed.current && !window.matchMedia(REDUCED_MOTION_QUERY).matches;
    hasRevealed.current = true;
    if (left !== list.scrollLeft) list.scrollTo({ left, behavior: glides ? 'smooth' : 'instant' });
  }, [listRef, selectedIndex, margin]);
}
