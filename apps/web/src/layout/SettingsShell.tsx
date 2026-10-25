import type { CSSProperties } from 'react';
import { Outlet } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { NavigationSidebar } from './NavigationSidebar';
import { TopBar } from './TopBar';
import { SettingsReturnLink } from './SettingsReturnLink';
import { AdminOnlyRedirectNotice } from './AdminOnlyRedirectNotice';

/**
 * 全体設定（/settings/<section>）のレイアウト。どのProjectにも属さない画面をまとめる。
 * ナビゲーションに出すのは、全体設定の組と、全体管理者向けの全体管理の組だけ。画面の上には、
 * 開く前のProjectの画面へ戻るリンクを置く。
 */
export function SettingsShell() {
  const navigation = useNavigation();
  return (
    <div
      className="app-shell"
      data-navigation={navigation.layout.mode}
      style={{ '--navigation-width': `${navigation.layout.width}px` } as CSSProperties}
    >
      <TopBar navigation={navigation} />
      <div className="app-body">
        {navigation.layout.mode !== 'drawer' && <NavigationSidebar navigation={navigation} />}
        <main id="content" className="page app-content">
          <SettingsReturnLink />
          <AdminOnlyRedirectNotice />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
