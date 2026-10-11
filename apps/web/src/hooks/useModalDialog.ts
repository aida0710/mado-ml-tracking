import { useEffect, type RefObject } from 'react';

// The fields a dialog opens on in place of its × button, so typing starts at once.
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';
// On a touch screen a focused field opens the on-screen keyboard over half the dialog before the
// user has read it; there the dialog itself takes the focus (Dialog gives it tabIndex -1).
const TOUCH_SCREEN_QUERY = '(pointer: coarse)';

/**
 * Shows the dialog as modal while its component is mounted, with the focus on its first field
 * (on the dialog itself on a touch screen, on × when it has no field), and afterwards gives focus
 * back to the element that had it when the dialog opened (usually the button that opened it).
 *
 * Callers unmount an open dialog (`{open && <XxxDialog />}`). The browser returns focus only in
 * close(), and by the time this cleanup runs the dialog has already left the document, so without
 * this focus would fall back to the top of the page.
 */
export function useModalDialog(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog?.showModal();
    if (dialog) focusOnOpen(dialog);
    return () => {
      dialog?.close();
      returnFocusTo(opener);
    };
  }, [dialogRef]);
}

function focusOnOpen(dialog: HTMLDialogElement) {
  if (window.matchMedia(TOUCH_SCREEN_QUERY).matches) {
    dialog.focus();
    return;
  }
  // A field in a closed <details> or hidden by its form cannot take the focus; the next one does.
  for (const field of dialog.querySelectorAll<HTMLElement>(FIELD_SELECTOR)) {
    field.focus();
    if (document.activeElement === field) return;
  }
}

/**
 * Focuses the opener only when focus was lost with the dialog: whatever code focused on purpose
 * after closing (a new page, a field) keeps it, and an opener that left the page (a menu item of a
 * closed menu, a row that was deleted) is skipped.
 */
function returnFocusTo(opener: Element | null) {
  const lostFocus = document.activeElement === null || document.activeElement === document.body;
  if (lostFocus && opener instanceof HTMLElement && opener !== document.body && opener.isConnected)
    opener.focus();
}
