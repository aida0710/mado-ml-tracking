import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Globe } from 'lucide-react';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import { useLocale } from '../i18n/useLocale';
import { languageText } from '../i18n/language';
import { LANGUAGES } from '../i18n/languages';

// Match the shared popover width; two language buttons fit within this height.
const LANGUAGE_MENU_MIN_WIDTH = 220;
const LANGUAGE_MENU_MAX_HEIGHT = 160;

/** Available before sign-in as well as in the application header. */
export function LanguagePicker() {
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const popoverStyle = useAnchoredPopover({ isOpen, anchorRef: trigger, popoverRef: menu,
    minWidth: LANGUAGE_MENU_MIN_WIDTH, maxHeight: LANGUAGE_MENU_MAX_HEIGHT, alignment: 'end' });
  const label = languageText.language;
  const selectedName = LANGUAGES.find(language => language.locale === locale)!.name;

  const closeAndFocus = () => {
    setIsOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!isOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [isOpen]);

  const navigateMenu = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndFocus();
      return;
    }
    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (current + 1) % buttons.length
      : event.key === 'ArrowUp' ? (current + buttons.length - 1) % buttons.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div ref={container}>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={`${label}: ${selectedName}`}
        title={`${label}: ${selectedName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setIsOpen(true);
        }}
      >
        <Globe size={17} aria-hidden="true" />
      </button>
      {isOpen && (
        <div ref={menu} id={menuId} className="popover anchored-popover language-picker-menu" popover="manual" role="menu" aria-label={label}
          onKeyDown={navigateMenu} style={popoverStyle}>
          {LANGUAGES.map(language => (
            <button
              key={language.locale}
              type="button"
              className="button"
              role="menuitemradio"
              aria-checked={locale === language.locale}
              lang={language.locale}
              onClick={() => {
                setLocale(language.locale);
                closeAndFocus();
              }}
            >
              <Check size={15} className="language-picker-check" aria-hidden="true" />
              <span>{language.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
