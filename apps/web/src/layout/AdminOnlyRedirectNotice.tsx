import { useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/useLocale';
import { settingsShellText } from '../i18n/settingsShell';

/** 全体管理者でない人をAdminPageがほかの画面へ送るときに、遷移に残すstate。 */
export interface AdminOnlyRedirectState {
  redirectedFromAdminSection: true;
}

function isAdminOnlyRedirect(state: unknown): state is AdminOnlyRedirectState {
  return (state as Partial<AdminOnlyRedirectState> | null)?.redirectedFromAdminSection === true;
}

/**
 * 同僚から送られた全体管理の画面へのリンクで、代わりにアカウントが開いた理由を伝える。stateは
 * その1回の遷移に付いたものなので、利用者がほかへ移れば表示は消える。
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
