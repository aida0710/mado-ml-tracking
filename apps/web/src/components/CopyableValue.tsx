import { CopyButton } from './CopyButton';

/**
 * A value to paste elsewhere (an ID, a command, a public key, a webhook secret) with a button that
 * copies it exactly, since IDs are long and a double click selects only part of one.
 */
export function CopyableValue({ value, label }: { value: string; label?: string }) {
  return (
    <div className="copyable-value">
      {label && <span className="copyable-value-label">{label}</span>}
      <code>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
