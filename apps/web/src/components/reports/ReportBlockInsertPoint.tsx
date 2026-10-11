import { useLocale } from '../../i18n/useLocale';
import { useState } from 'react';
import { FileText, LayoutGrid, Plus } from 'lucide-react';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * A place under a block where a new block goes, so it need not be added at the end and moved up
 * block by block. It stays a small button until opened, to keep the editor readable.
 */
export function ReportBlockInsertPoint({
  position,
  onAddMarkdown,
  onAddEmbed,
}: {
  /** 1-based number of the block above, for the accessible name. */
  position: number;
  onAddMarkdown: () => void;
  onAddEmbed: () => void;
}) {
  useLocale();
  const [isOpen, setOpen] = useState(false);
  if (!isOpen)
    return (
      <div className="report-insert-point">
        <button
          type="button"
          className="report-insert-toggle"
          aria-label={textTemplates.reportInsertBelow(position)}
          onClick={() => setOpen(true)}
        >
          <Plus size={14} aria-hidden="true" />
          {text.reportInsertHere}
        </button>
      </div>
    );
  const add = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <div className="report-insert-point open" role="group" aria-label={textTemplates.reportInsertBelow(position)}>
      {/* Opening replaces the button that had focus; the first choice takes it over. */}
      <button type="button" className="button small" autoFocus onClick={() => add(onAddMarkdown)}>
        <FileText size={14} />
        {text.reportAddMarkdown}
      </button>
      <button type="button" className="button small" onClick={() => add(onAddEmbed)}>
        <LayoutGrid size={14} />
        {text.reportAddEmbed}
      </button>
      <button type="button" className="button small" onClick={() => setOpen(false)}>
        {text.cancel}
      </button>
    </div>
  );
}
