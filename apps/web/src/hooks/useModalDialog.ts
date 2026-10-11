import { useEffect, type RefObject } from 'react';

/**
 * Shows the dialog as modal while its component is mounted, and afterwards gives focus back to the
 * element that had it when the dialog opened (usually the button that opened it).
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
    return () => {
      dialog?.close();
      returnFocusTo(opener);
    };
  }, [dialogRef]);
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
