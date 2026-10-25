import type { ReactNode } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildSubmitCliSetupSnippets } from '../lib/submitCliSetup';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 手動のsiteで、依頼する人が`mado-tracking submit`の前に一度だけ準備すること。コマンド、接続先の
 * URL、自分のtoken。最初の1回にしか要らないので畳んでおく。Projectを開いているときは`tokenButton`で
 * その場でtokenを発行でき、それ以外では文でどこで発行するかを伝える。
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
