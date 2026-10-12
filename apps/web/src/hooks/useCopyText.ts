import { useEffect, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { useMutation } from './useMutation';

/** Keeps copy feedback tied to the current value, including when a component is reused. */
export function useCopyText(value: string) {
  const [isCopied, setIsCopied] = useState(false);
  const mutation = useMutation();
  const { clearError } = mutation;
  useEffect(() => {
    setIsCopied(false);
    clearError();
  }, [value, clearError]);

  function copy() {
    setIsCopied(false);
    return mutation.run(async () => {
      await copyText(value);
      setIsCopied(true);
    });
  }

  return { copy, isCopied, isPending: mutation.pending, error: mutation.error };
}
