import { useId } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildWorkerSetupSnippets } from '../lib/workerSetupSnippets';
import { text } from '../i18n/catalog';

/**
 * How to run a worker that takes this computer's Jobs (and its connection checks), with the
 * computer's ID filled in, so nobody looks the ID up in /api/targets.
 */
export function WorkerSetupGuide({ targetId }: { targetId: string }) {
  const headingId = useId();
  const snippets = buildWorkerSetupSnippets({ origin: window.location.origin, targetId });
  return (
    <section className="settings-section" aria-labelledby={headingId} data-testid="worker-setup">
      <div className="section-heading">
        <h2 id={headingId}>{text.workerSetupTitle}</h2>
      </div>
      <p className="muted">{text.workerSetupHint}</p>
      <p className="muted">{text.workerSetupToken}</p>
      <CodeSnippet label={text.workerSetupInstall} code={snippets.install} />
      <CodeSnippet label={text.workerSetupService} code={snippets.service} />
      <details className="connection-more">
        <summary>{text.workerSetupEnvironment}</summary>
        <CodeSnippet label={text.workerSetupEnvironmentCommands} code={snippets.environment} />
      </details>
    </section>
  );
}
