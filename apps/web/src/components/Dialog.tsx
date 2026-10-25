import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalDialog } from '../hooks/useModalDialog';
import { dialogClassName } from './dialogClassName';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

export function Dialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  fullScreenOnNarrow = true,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  fullScreenOnNarrow?: boolean;
  className?: string;
}) {
  useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useModalDialog(dialogRef);
  return (
    <dialog
      ref={dialogRef}
      className={dialogClassName({ wide, fullScreenOnNarrow, className })}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby={titleId}
      // useModalDialog focuses the dialog itself on a touch screen.
      tabIndex={-1}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        {/* type="button": a dialog rendered inside a form would otherwise submit that form. */}
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label={text.close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
