import type { ReactNode } from 'react';
import { EmptyMessage, ErrorNotice as DesignSystemErrorNotice, LoadingMessage } from '@mado/design-system/react';
import type { QueryState } from '../hooks/useQuery';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { localizeMessage } from '../i18n/messageTranslations';

/**
 * 読み込みや操作の失敗（デザインシステムのErrorNotice）。サーバーの文はこのアプリの訳に通して出す。
 * `retry`を渡すと再試行のボタンを出す。
 */
export function ErrorNotice({ message, retry }: { message: string | null; retry?: () => void }) {
  useLocale();
  return (
    <DesignSystemErrorNotice
      message={message === null ? null : localizeMessage(message)}
      retry={retry}
      retryLabel={text.retry}
    />
  );
}
export function Loading() {
  useLocale();
  return <LoadingMessage label={text.loading} />;
}
export function Empty({ children = text.empty }: { children?: ReactNode }) {
  useLocale();
  return <EmptyMessage>{children}</EmptyMessage>;
}
export function Resource<T>({
  query,
  children,
}: {
  query: QueryState<T>;
  children: (value: T) => ReactNode;
}) {
  useLocale();
  if (query.error) return <ErrorNotice message={query.error} retry={query.reload} />;
  if (query.value === undefined) return query.loading ? <Loading /> : null;
  return <>{children(query.value)}</>;
}
