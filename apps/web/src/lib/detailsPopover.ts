import type { FocusEvent, KeyboardEvent } from 'react';

/**
 * 中身がポップオーバーのようにページの上に浮かぶ<details>のイベントハンドラ（「表示する列」、
 * 「既定の表示」、図の「配置」）。Escapeで閉じてフォーカスをsummaryに戻し、Tabでフォーカスが外へ
 * 出たときも閉じて、ページの上に開いたまま残らないようにする。外の何も無いところをクリックしても
 * フォーカスは動かないので、これまでどおり開いたまま。
 */
export const detailsPopoverHandlers = {
  onKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    const details = event.currentTarget;
    if (event.key !== 'Escape' || !details.open) return;
    // 閉じるのはこのポップオーバーだけで、それを含むダイアログは閉じない。
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    details.querySelector('summary')?.focus();
  },
  onBlur(event: FocusEvent<HTMLDetailsElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) event.currentTarget.open = false;
  },
};
