import type { FocusEvent, KeyboardEvent } from 'react';

/**
 * Event handlers for a <details> whose content floats over the page like a popover (表示する列,
 * 既定の表示, the chart's 配置). Escape closes it and puts the focus back on its summary, and moving
 * the focus out of it with Tab closes it, so it does not stay open over the page. A click on an
 * empty spot outside moves no focus and leaves it open, as before.
 */
export const detailsPopoverHandlers = {
  onKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    const details = event.currentTarget;
    if (event.key !== 'Escape' || !details.open) return;
    // Only this popover closes, not a dialog it sits in.
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
