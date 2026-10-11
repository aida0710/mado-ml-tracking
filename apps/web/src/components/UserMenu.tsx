import { useLocale } from '../i18n/useLocale';
import { useEffect, useId, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePopover } from '../hooks/usePopover';
import { userMenuLinks } from '../layout/userMenuLinks';
import { isListNavigationKey, moveActiveIndex } from '../lib/listNavigation';
import { text } from '../i18n/catalog';

// Two letters fit the 27px avatar circle.
const AVATAR_INITIALS_LENGTH = 2;

/**
 * The avatar in the top bar; it opens a menu with the signed-in user, their account pages and
 * 全体設定. With the keyboard it works as a menu button: Enter, Space or ↓ opens it on the first
 * item (↑ on the last), and ↓ ↑ on the avatar of a menu a click opened go to them the same way;
 * ↑↓ Home End move between the items, Escape goes back to the avatar and Tab leaves the menu
 * closed.
 */
export function UserMenu() {
  useLocale();
  const auth = useAuth();
  const menuId = useId();
  const { container, isOpen, open, close, toggle } = usePopover();
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // The item to focus once the menu has rendered, when the keyboard opened it.
  const itemToFocusOnOpen = useRef<number | null>(null);
  const initials = auth.user.displayName.slice(0, AVATAR_INITIALS_LENGTH).toUpperCase();
  const links = userMenuLinks(auth.user);

  useEffect(() => {
    if (!isOpen || itemToFocusOnOpen.current === null) return;
    itemRefs.current[itemToFocusOnOpen.current]?.focus();
    itemToFocusOnOpen.current = null;
  }, [isOpen]);

  // Already open (a click opened it and left the focus on the avatar), the item can take the focus
  // now; otherwise it waits for the menu to render.
  const focusItem = (index: number) => {
    if (isOpen) {
      itemRefs.current[index]?.focus();
      return;
    }
    itemToFocusOnOpen.current = index;
    open();
  };
  const handleAvatarClick = (event: MouseEvent<HTMLButtonElement>) => {
    // detail is 0 for a click made with Enter or Space.
    if (event.detail === 0 && !isOpen) focusItem(0);
    else toggle();
  };
  const handleAvatarKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    focusItem(event.key === 'ArrowDown' ? 0 : links.length - 1);
  };
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isListNavigationKey(event.key)) return;
    event.preventDefault();
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    itemRefs.current[moveActiveIndex({ current, key: event.key, count: links.length })]?.focus();
  };
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (isOpen && next && !event.currentTarget.contains(next)) close();
  };

  return (
    <div className="user-menu" ref={container} onBlur={closeWhenFocusLeaves}>
      <button
        type="button"
        className="avatar"
        title={auth.user.displayName}
        aria-label={text.userMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={handleAvatarClick}
        onKeyDown={handleAvatarKeyDown}
      >
        {initials}
      </button>
      {isOpen && (
        <div
          className="user-menu-popover"
          id={menuId}
          role="menu"
          aria-label={text.userMenu}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="user-menu-identity">
            <strong>{auth.user.displayName}</strong>
            {auth.user.email && <span className="muted">{auth.user.email}</span>}
          </div>
          {links.map((link, index) => (
            <Link
              key={link.label}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              tabIndex={-1}
              to={link.to}
              className={link.isSettingsEntry ? 'user-menu-settings' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
