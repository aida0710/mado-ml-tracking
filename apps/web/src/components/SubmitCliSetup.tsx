import type { ReactNode } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildSubmitCliSetupSnippets } from '../lib/submitCliSetup';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * What a requester sets up once on a manual site before `mado-tracking submit`: the command, the
 * URL it connects to and their own token. Folded, since it is needed only the first time. Where a
 * Project is open, `tokenButton` issues the token right here; elsewhere the text says where.
 */
export function SubmitCliSetup({ tokenButton }: { tokenButton?: ReactNode }) {
  useLocale();
  const snippets = buildSubmitCliSetupSnippets(window.location.origin);
  return (
    <details className="connection-more submit-cli-setup">
      <summary>{text.submitSetupTitle}</summary>
      <CodeSnippet label={text.submitSetupInstall} code={snippets.install} />
      <p>{text.submitSetupToken}</p>
      {tokenButton}
      <CodeSnippet label={text.submitSetupEnvironment} code={snippets.environment} />
    </details>
  );
}
