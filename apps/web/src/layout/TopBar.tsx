import { Link } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import { narrowerThan } from '@mado/design-system/layout';
import { NavigationDrawer, useMediaQuery, useTheme } from '@mado/design-system/react';
import { useMutation } from '../hooks/useMutation';
import type { Navigation } from '../hooks/useNavigation';
import { THEME_STORAGE_KEY } from '../lib/theme';
import { ErrorNotice } from '../components/Feedback';
import { LanguagePicker } from '../components/LanguagePicker';
import { UserMenu } from '../components/UserMenu';
import { ProductLogo } from '../components/ProductLogo';
import { OperationsAlertBadge } from '../components/OperationsAlertBadge';
import { NavigationLinkList } from './NavigationLinkList';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 上部バー: アプリ名、表示言語、テーマ、ログイン中の利用者とログアウト。画面の切り替えはサイドバーか
 * レールにあり、900px未満ではこのバーのメニューボタンからドロワーで開く。640px未満ではボタンに場所を
 * 譲り、アプリ名は印だけを見せる（mado S3 Data Catalogと同じ幅）。
 */
export function TopBar({ projectId, navigation }: { projectId?: string; navigation: Navigation }) {
  useLocale();
  const auth = useAuth();
  const theme = useTheme({ storageKey: THEME_STORAGE_KEY });
  const mutation = useMutation();
  const isAppNameVisuallyHidden = useMediaQuery(narrowerThan('sm'));
  return (
    <>
      <a className="skip-link" href="#content">
        {text.skipContent}
      </a>
      <header className="topbar">
        {navigation.layout.mode === 'drawer' && navigation.groups.length > 0 && (
          <NavigationDrawer
            labels={{ open: text.openNavigation, close: text.closeNavigation, navigation: text.navigation }}
            header={<ProductLogo />}
          >
            <NavigationLinkList groups={navigation.groups} />
          </NavigationDrawer>
        )}
        <Link to="/" className="brand">
          <ProductLogo compact={isAppNameVisuallyHidden} />
        </Link>
        <div className="topbar-actions">
          <LanguagePicker />
          <OperationsAlertBadge openProjectId={projectId} />
          <button
            className="icon-button"
            onClick={theme.toggle}
            aria-label={theme.theme === 'light' ? text.darkTheme : text.lightTheme}
          >
            {theme.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <UserMenu />
          <button
            className="icon-button"
            disabled={mutation.pending}
            aria-label={text.logout}
            onClick={() =>
              void mutation.run(async () => {
                await authApi.logout();
                auth.reload();
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <ErrorNotice message={mutation.error} />
    </>
  );
}
