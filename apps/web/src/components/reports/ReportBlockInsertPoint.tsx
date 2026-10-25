import { useState } from 'react';
import { FileText, LayoutGrid, Plus } from 'lucide-react';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * ブロックの下の、新しいブロックを入れる場所。末尾に足してから1つずつ上へ動かさなくて済む。
 * 編集画面を読みやすく保つため、開くまでは小さなボタンのまま。
 */
export function ReportBlockInsertPoint({
  position,
  onAddMarkdown,
  onAddEmbed,
}: {
  /** 上のブロックの1始まりの番号。アクセシブルな名前に使う。 */
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
      {/* 開くとフォーカスを持っていたボタンが置き換わるので、最初の選択肢がフォーカスを引き継ぐ。 */}
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
