import { useId } from 'react';
import { NavLink } from 'react-router-dom';
import type { NavigationGroup, NavigationLink } from './navigationLinks';
import { NAVIGATION_ICONS } from './navigationIcons';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

function NavigationLinkItem({ link, showsTitle }: { link: NavigationLink; showsTitle: boolean }) {
  const Icon = NAVIGATION_ICONS[link.screen];
  return (
    <NavLink to={link.to} className="navigation-link" title={showsTitle ? link.label : undefined}>
      <Icon aria-hidden="true" />
      <span className="navigation-label">{link.label}</span>
    </NavLink>
  );
}

/**
 * メインのナビゲーションのリンク。組の見出しの下にアイコン付きで並べ、配置はサイドバー・レール・
 * ドロワーが決める。レールは画面に名前を出さないので、名前をツールチップで出す。`footerLink`は
 * 組から離して並びの下端に置く。
 */
export function NavigationLinkList({
  groups,
  footerLink = null,
  showsTitles = false,
}: {
  groups: NavigationGroup[];
  footerLink?: NavigationLink | null;
  showsTitles?: boolean;
}) {
  useLocale();
  const idPrefix = useId();
  return (
    <nav aria-label={text.navigation}>
      {groups.map((group, index) => {
        const labelId = `${idPrefix}-group-${index}`;
        return (
          <div key={group.label} className="navigation-group" role="group" aria-labelledby={labelId}>
            <span id={labelId} className="navigation-group-label">
              {group.label}
            </span>
            {group.links.map((link) => (
              <NavigationLinkItem key={link.to} link={link} showsTitle={showsTitles} />
            ))}
          </div>
        );
      })}
      {footerLink && (
        <div className="navigation-footer-link">
          <NavigationLinkItem link={footerLink} showsTitle={showsTitles} />
        </div>
      )}
    </nav>
  );
}
