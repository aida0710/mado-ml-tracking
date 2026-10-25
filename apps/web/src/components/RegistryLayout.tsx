import { useEffect, useRef, type ReactNode } from 'react';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';

/**
 * 選んだ項目の詳細を一覧の横に置く。900px未満では詳細を一覧の下に置く。そこでは選び直したとき
 * （`selectedKey`が変わったとき）に詳細までスクロールする。そうしないとタップしても何も起きない
 * ように見える。ページを読み込む間の最初の選択ではスクロールしない。
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
