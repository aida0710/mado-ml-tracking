import { LoginHeader } from '../components/LoginHeader';
import { useState } from 'react';
import type { AuthConfig } from '@mmt/contracts';
import { authApi } from '../api/auth';
import { useMutation } from '../hooks/useMutation';
import { ErrorNotice } from '../components/Feedback';
import { LocalLoginForm } from '../components/LocalLoginForm';
import { rememberAuthReturnPath } from '../lib/authReturnPath';
import { loginMethods } from '../lib/loginMethods';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

function DevelopmentLoginForm({ onLogin }: { onLogin: () => void }) {
  useLocale();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const mutation = useMutation();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void mutation.run(async () => {
          await authApi.devLogin(email, displayName);
          onLogin();
        });
      }}
    >
      <p className="muted">{text.devLoginHint}</p>
      <label className="field">
        <span>{text.email}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="field">
        <span>{text.displayName}</span>
        <input
          required
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <ErrorNotice message={mutation.error} />
      <button className="button primary" disabled={mutation.pending}>
        {text.devLogin}
      </button>
    </form>
  );
}

// mado S3 Data Catalogのログインと同じカード。アプリ名、何のアプリか、ログインの方法の順に
// 並べる。hybridではSSOを先に、ローカルアカウントのフォームを区切りの下に出す。
export function LoginPage({ config, onLogin }: { config: AuthConfig; onLogin: () => void }) {
  useLocale();
  const methods = loginMethods(config);
  return (
    <div className="login-page">
      <main className="login-card">
        <LoginHeader />
        <p className="login-eyebrow">{text.loginEyebrow}</p>
        <h1>{text.loginTitle}</h1>
        {methods.development && <DevelopmentLoginForm onLogin={onLogin} />}
        {methods.sso && (
          <a
            className="button primary"
            href={methods.sso.loginUrl}
            onClick={() =>
              rememberAuthReturnPath(location.pathname + location.search + location.hash)
            }
          >
            {methods.sso.label || text.login}
          </a>
        )}
        {methods.sso && methods.local && <p className="login-or">{text.localLoginSeparator}</p>}
        {methods.local && <LocalLoginForm onLogin={onLogin} />}
        {!methods.development && !methods.sso && !methods.local && (
          <ErrorNotice message={text.ssoUnavailable} />
        )}
      </main>
    </div>
  );
}
