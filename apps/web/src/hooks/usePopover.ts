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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => setIsOpen(false), [location.pathname]);
  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const element = container.current;
      if (element?.contains(document.activeElement))
        element.querySelector<HTMLElement>('[aria-expanded]')?.focus();
      setIsOpen(false);
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
    toggle: () => setIsOpen((open) => !open),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
