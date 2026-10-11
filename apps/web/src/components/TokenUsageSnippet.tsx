import { useLocale } from '../i18n/useLocale';
import { useId, useState } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildTokenUsageSnippet, type TokenAuthentication } from '../lib/tokenUsageSnippet';
import { text } from '../i18n/catalog';

/**
 * Environment variables for the MLflow and Mado SDKs, shown right after a token is issued. The
 * example holds no token; running it asks for one, which is pasted from the dialog.
 */
export function TokenUsageSnippet({ projectId }: { projectId: string }) {
  useLocale();
  const authenticationId = useId();
  const [authentication, setAuthentication] = useState<TokenAuthentication>('bearer');
  const snippet = buildTokenUsageSnippet({
    origin: window.location.origin,
    projectId,
    authentication,
  });
  return (
    <section className="field token-usage" aria-label={text.tokenUsage}>
      <span>{text.tokenUsage}</span>
      <div className="field">
        <label htmlFor={authenticationId}>{text.tokenAuthentication}</label>
        <select
          id={authenticationId}
          value={authentication}
          onChange={(event) => setAuthentication(event.target.value as TokenAuthentication)}
        >
          <option value="bearer">{text.tokenAuthenticationBearer}</option>
          <option value="basic">{text.tokenAuthenticationBasic}</option>
        </select>
      </div>
      <CodeSnippet
        label={text.tokenUsageEnvironment}
        code={snippet}
        copyLabel={text.copyTokenUsage}
      />
      <p className="field-hint">{text.tokenUsageHint}</p>
    </section>
  );
}
