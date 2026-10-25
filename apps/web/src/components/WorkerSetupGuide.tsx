import { useId } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildWorkerSetupSnippets } from '../lib/workerSetupSnippets';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * このコンピュータのJob（と接続確認）を引き受けるworkerの動かし方。コンピュータのIDを埋めて
 * 出すので、/api/targetsでIDを調べなくて済む。
 */
export function WorkerSetupGuide({ targetId }: { targetId: string }) {
  useLocale();
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
