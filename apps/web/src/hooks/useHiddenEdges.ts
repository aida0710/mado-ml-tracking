import { useLayoutEffect, useState, type RefObject } from 'react';
import { hiddenEdges, type HiddenEdges } from '../lib/horizontalScroll';

/**
 * 横にスクロールする要素のどちらの端が内容を隠しているか。スクロールや大きさの変化に合わせて
 * 最新に保つ。`contentKey`は内容が変わったとき（タブの追加や名前の変更）に変わる。これは大きさの
 * 変化としては通知されない。
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
