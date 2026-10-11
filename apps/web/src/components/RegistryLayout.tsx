import { useEffect, useRef, type ReactNode } from 'react';
import { narrowerThan } from '../lib/breakpoints';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * A list beside the chosen item's detail; below --bp-md the detail sits under the list. There a
 * new choice (a different `selectedKey`) scrolls the detail into view, or the tap would seem to do
 * nothing. The first choice made while the page loads does not scroll.
 */
export function RegistryLayout({
  list,
  children,
  selectedKey,
}: {
  list: ReactNode;
  children: ReactNode;
  selectedKey?: string;
}) {
  const isNarrow = useMediaQuery(narrowerThan('md'));
  const detailRef = useRef<HTMLElement>(null);
  const previousKey = useRef(selectedKey);
  useEffect(() => {
    const changedFromEarlierChoice =
      previousKey.current !== undefined && previousKey.current !== selectedKey;
    previousKey.current = selectedKey;
    if (isNarrow && selectedKey && changedFromEarlierChoice)
      detailRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedKey, isNarrow]);
  return (
    <div className="registry-layout">
      <section className="registry-list">{list}</section>
      <section className="registry-detail" ref={detailRef}>
        {children}
      </section>
    </div>
  );
}
