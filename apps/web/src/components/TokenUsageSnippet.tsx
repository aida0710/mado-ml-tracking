import { useId, useState } from 'react';
import { CodeSnippet } from './CodeSnippet';
import { buildTokenUsageSnippet, type TokenAuthentication } from '../lib/tokenUsageSnippet';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * tokenを発行した直後に出す、MLflowとPython SDK（mado-tracking）のための環境変数。例にはtokenを
 * 含めない。実行するとtokenを尋ねるので、ダイアログから貼り付ける。
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
