import { Link, useLocation } from 'react-router-dom';
import { UserMenu as DesignSystemUserMenu, type UserMenuLinkRenderer } from '@mado/design-system/react';
import { useAuth } from '../hooks/useAuth';
import { userMenuLinks } from '../layout/userMenuLinks';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

// 項目はreact-routerのLinkで描き、ページを読み直さずに移る。
const renderUserMenuLink: UserMenuLinkRenderer = (item, { children, ...props }) => (
  <Link {...props} to={item.href}>
    {children}
  </Link>
);

/**
 * 上部バーの頭文字の丸と、そこから開くメニュー（デザインシステムのUserMenu）。ログイン中の利用者と、
 * アカウントの画面・全体設定へのリンク、最後にログアウト。画面を移ると閉じる。
 */
export function UserMenu({ onLogout, isLoggingOut }: { onLogout: () => void; isLoggingOut: boolean }) {
  useLocale();
  const auth = useAuth();
  const { pathname } = useLocation();
  return (
    <DesignSystemUserMenu
      displayName={auth.user.displayName}
      email={auth.user.email}
      label={text.userMenu}
      items={[
        ...userMenuLinks(auth.user),
        { label: text.logout, onSelect: onLogout, disabled: isLoggingOut, startsGroup: true },
      ]}
      renderLink={renderUserMenuLink}
      closeKey={pathname}
    />
  );
}
