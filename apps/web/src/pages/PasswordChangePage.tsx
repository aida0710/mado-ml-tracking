import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { PasswordChangeForm } from '../components/PasswordChangeForm';
import { SettingsPageHeader } from '../components/SettingsPageHeader';
import { canChangeOwnPassword } from '../lib/permissions';
import { settingsSectionPath } from '../layout/settingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 全体設定 → アカウント → パスワードの変更（/settings/account/password）。ローカルアカウント向け。
 * SSOのユーザーはIdPで変えるので、代わりに本人のアカウントへ移す。
 */
export function PasswordChangePage() {
  useLocale();
  const auth = useAuth();
  if (!canChangeOwnPassword(auth.user))
    return <Navigate replace to={settingsSectionPath('account')} />;
  return (
    <>
      <SettingsPageHeader section="account" title={text.passwordChange} />
      <div className="account-page">
        <section className="account-section">
          <PasswordChangeForm />
        </section>
      </div>
    </>
  );
}
