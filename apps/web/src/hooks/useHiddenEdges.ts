import { useLayoutEffect, useState, type RefObject } from 'react';
import { hiddenEdges, type HiddenEdges } from '../lib/horizontalScroll';

/**
 * Which ends of a sideways scrolling element hide content, kept current as it scrolls or resizes.
 * `contentKey` changes when the content does (a tab added or renamed), which resizing does not
 * report.
 */
export function useHiddenEdges(elementRef: RefObject<HTMLElement | null>, contentKey: string): HiddenEdges {
  const [edges, setEdges] = useState<HiddenEdges>(null);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const update = () => setEdges(hiddenEdges(element));
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [elementRef, contentKey]);
  return edges;
}
