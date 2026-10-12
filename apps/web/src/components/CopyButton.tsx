import { Copy } from 'lucide-react';
import { useCopyText } from '../hooks/useCopyText';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Copies `value`. `label` names what is copied where a dialog has more than one copy button
 * (the token itself and the settings example); without it the button reads "コピー".
 */
export function CopyButton({ value, label = text.copy }: { value: string; label?: string }) {
  useLocale();
  const clipboard = useCopyText(value);
  return (
    <span className="copy-button-control">
      <button
        type="button"
        className="button small"
        disabled={clipboard.isPending}
        onClick={() => void clipboard.copy()}
      >
        <Copy size={13} aria-hidden="true" />
        {clipboard.isCopied ? text.copied : label}
      </button>
      {clipboard.error && <span className="copy-button-error" role="alert">{clipboard.error}</span>}
    </span>
  );
}
