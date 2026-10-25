import { useId } from 'react';
import { NavLink } from 'react-router-dom';
import type { NavigationGroup } from './navigationLinks';
import { NAVIGATION_ICONS } from './navigationIcons';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * メインのナビゲーションのリンク。組の見出しの下にアイコン付きで並べ、配置はサイドバー・レール・
 * ドロワーが決める。レールは画面に名前を出さないので、名前をツールチップで出す。
 */
export function NavigationLinkList({
  groups,
  showsTitles = false,
}: {
  groups: NavigationGroup[];
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
            {group.links.map((link) => {
              const Icon = NAVIGATION_ICONS[link.screen];
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className="navigation-link"
                  title={showsTitles ? link.label : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span className="navigation-label">{link.label}</span>
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
