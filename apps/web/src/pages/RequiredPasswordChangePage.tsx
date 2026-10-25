import { authApi } from '../api/auth';
import { useMutation } from '../hooks/useMutation';
import { PasswordChangeForm } from '../components/PasswordChangeForm';
import { ErrorNotice } from '../components/Feedback';
import { LoginHeader } from '../components/LoginHeader';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 初期パスワードを変えるまで、AuthGateがほかのどの画面よりも先に出す。onChangedはsessionを
 * 読み直す。アプリの代わりに出るので、パスワードを変える以外の唯一の出口も置く。
 * 自分の意思での変更は、全体設定のPasswordChangePage。
 */
export function RequiredPasswordChangePage({ onChanged }: { onChanged: () => void }) {
  useLocale();
  const logout = useMutation();
  return (
    <div className="login-page">
      <main className="login-card">
        <LoginHeader />
        <h1>{text.changePasswordTitle}</h1>
        <PasswordChangeForm isRequired onChanged={onChanged} />
        <ErrorNotice message={logout.error} />
        <button
          type="button"
          className="button"
          disabled={logout.pending}
          onClick={() =>
            void logout.run(async () => {
              await authApi.logout();
              onChanged();
            })
          }
        >
          {text.logout}
        </button>
      </main>
    </div>
  );
}
