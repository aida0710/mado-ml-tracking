import { CopyButton } from './CopyButton';

/** Lines to run or paste (shell settings, an example program) under a label, copied whole. */
export function CodeSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="code-snippet">
      <div className="code-snippet-heading">
        <span>{label}</span>
        <CopyButton value={code} />
      </div>
      <pre className="json-view">{code}</pre>
    </div>
  );
}
