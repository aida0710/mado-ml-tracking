import { useLocale } from '../i18n/useLocale';
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useMutation } from '../hooks/useMutation';
import { ErrorNotice } from './Feedback';
import { text } from '../i18n/catalog';

/**
 * Copies `value`. `label` names what is copied where a dialog has more than one copy button
 * (the token itself and the settings example); without it the button reads "コピー".
 */
export function CopyButton({ value, label = text.copy }: { value: string; label?: string }) {
  useLocale();
  const [copied, setCopied] = useState(false);
  const mutation = useMutation();
  return (
    <>
      <button
        type="button"
        className="button small"
        disabled={mutation.pending}
        onClick={() =>
          void mutation.run(async () => {
            if (!navigator.clipboard) throw new Error(text.copyFailed);
            await navigator.clipboard.writeText(value);
            setCopied(true);
          })
        }
      >
        <Copy size={13} />
        {copied ? text.copied : label}
      </button>
      <ErrorNotice message={mutation.error} />
    </>
  );
}
