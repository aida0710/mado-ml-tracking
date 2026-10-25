import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Open state of a popover anchored in `container`: it closes on a click outside the container,
 * on Escape, and when the page changes. Escape from inside the popover puts the focus back on the
 * button that opens it (the container's element with aria-expanded), as the popover's content
 * leaves the page with the focus in it.
 */
export function usePopover<Container extends HTMLElement = HTMLDivElement>() {
  const location = useLocation();
  const container = useRef<Container>(null);
  // The page the popover was opened on: it is open only there, so a new page never shows it open,
  // and it is forgotten on the first render elsewhere, so coming back does not reopen it.
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const isOpen = openPathname === location.pathname;
  if (openPathname !== null && !isOpen) setOpenPathname(null);
  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpenPathname(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const element = container.current;
      if (element?.contains(document.activeElement))
        element.querySelector<HTMLElement>('[aria-expanded]')?.focus();
      setOpenPathname(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return {
    container,
    isOpen,
    toggle: () => setOpenPathname((open) => (open === location.pathname ? null : location.pathname)),
    open: () => setOpenPathname(location.pathname),
    close: () => setOpenPathname(null),
  };
}
