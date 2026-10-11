import { CopyButton } from './CopyButton';

/** Lines to run or paste (shell settings, an example program) under a label, copied whole. */
export function CodeSnippet({
  label,
  code,
  copyLabel,
}: {
  label: string;
  code: string;
  /** What the copy button says, where another copy button sits nearby. */
  copyLabel?: string;
}) {
  return (
    <div className="code-snippet">
      <div className="code-snippet-heading">
        <span>{label}</span>
        <CopyButton value={code} label={copyLabel} />
      </div>
      {/* tabIndex: a long line scrolls sideways, which the keyboard reaches only with focus. */}
      <pre className="json-view" tabIndex={0}>
        {code}
      </pre>
    </div>
  );
}
