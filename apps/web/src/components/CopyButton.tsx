import { Check, Copy } from 'lucide-react';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * `value`をコピーする。押した後COPY_FEEDBACK_MSの間だけ、名前の代わりに結果（コピーしました・
 * コピーできませんでした）を出す。`label`はダイアログにコピーのボタンが2つ以上あるとき（トークンと設定の
 * 例）に何をコピーするかを示し、無ければ「コピー」。
 */
export function CopyButton({ value, label = text.copy }: { value: string; label?: string }) {
  useLocale();
  const { copied, copy } = useCopyFeedback();
  return (
    <button type="button" className="button small" onClick={() => void copy(value)}>
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied === null ? label : copied ? text.copied : text.copyFailed}
    </button>
  );
}
