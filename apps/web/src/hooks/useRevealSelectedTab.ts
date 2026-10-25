import { useLayoutEffect, useRef, type RefObject } from 'react';
import { scrollLeftToReveal } from '../lib/horizontalScroll';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 選択が変わるたびに、選んだタブが端から`margin`だけ離れて見えるように、タブの並びを横に
 * スクロールする。URLから開いたタブ、半分切れたまま押したタブ、キーで選んだタブが対象。
 * 画面を開いたときはすぐに移り、その後の変更は、利用者が動きを減らす設定にしていなければ滑らかに動く。
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
