import type { ReactNode } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import type { QueryState } from '../hooks/useQuery';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { localizeMessage } from '../i18n/messageTranslations';

export function ErrorNotice({ message, retry }: { message: string | null; retry?: () => void }) {
  useLocale();
  if (!message) return null;
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={16} />
      <span>{localizeMessage(message)}</span>
      {retry && (
        <button type="button" className="button small" onClick={retry}>
          <RefreshCw size={14} />
          {text.retry}
        </button>
      )}
    </div>
  );
}
export function Loading() {
  useLocale();
  return (
    <div className="state-message" role="status">
      <LoaderCircle className="spin" size={18} />
      {text.loading}
    </div>
  );
}
export function Empty({ children = text.empty }: { children?: ReactNode }) {
  useLocale();
  return <div className="state-message">{children}</div>;
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
