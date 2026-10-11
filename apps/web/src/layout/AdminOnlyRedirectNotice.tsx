import { useLocale } from '../i18n/useLocale';
import { useLocation } from 'react-router-dom';
import { settingsShellText } from '../i18n/settingsShell';

/** The navigation state AdminPage leaves when it sends someone who is not a global admin away. */
export interface AdminOnlyRedirectState {
  redirectedFromAdminSection: true;
}

function isAdminOnlyRedirect(state: unknown): state is AdminOnlyRedirectState {
  return (state as Partial<AdminOnlyRedirectState> | null)?.redirectedFromAdminSection === true;
}

/**
 * Says why a link to a 全体管理 screen (sent by a colleague) showed the account instead. The
 * state belongs to that one navigation, so the notice is gone once the user moves on.
 */
export function AdminOnlyRedirectNotice() {
  useLocale();
  const location = useLocation();
  if (!isAdminOnlyRedirect(location.state)) return null;
  return (
    <p className="notice" role="status">
      {settingsShellText.adminOnlyRedirectNotice}
    </p>
  );
}
