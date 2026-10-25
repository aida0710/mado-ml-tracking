import { useSearchParams } from 'react-router-dom';
import { useQuery } from './useQuery';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

interface RegistryItem {
  id: string;
}
interface RegistryVersion {
  id: string;
}
interface RegistryLoaders<T, V> {
  list: (signal: AbortSignal) => Promise<T[]>;
  versions: (id: string, signal: AbortSignal) => Promise<V[]>;
  parentId: (version: V) => string;
}
export function useRegistry<T extends RegistryItem, V extends RegistryVersion>(
  key: string,
  loaders: RegistryLoaders<T, V>,
) {
  useLocale();
  const [params, setParams] = useSearchParams();
  const requestedVersionId = params.get('version') ?? '';
  const requestedId = params.get('id') ?? '';
  const list = useQuery({ key: `${key}:list`, load: loaders.list });
  const lookup = useQuery({
    key: requestedVersionId && !requestedId && list.value ? `${key}:lookup:${requestedVersionId}` : null,
    load: async (signal) => {
      const versions = (
        await Promise.all((list.value ?? []).map((item) => loaders.versions(item.id, signal)))
      ).flat();
      return versions.find((version) => version.id === requestedVersionId) ?? null;
    },
  });
  const selectedId =
    requestedId ||
    (requestedVersionId
      ? lookup.value
        ? loaders.parentId(lookup.value)
        : ''
      : (list.value?.[0]?.id ?? ''));
  const selected = list.value?.find((item) => item.id === selectedId);
  const versions = useQuery({ key: selected ? `${key}:versions:${selected.id}` : null, load: (signal) =>
    loaders.versions(selectedId, signal),
  });
  const selectedVersion = requestedVersionId
    ? versions.value?.find((version) => version.id === requestedVersionId)
    : versions.value?.[0];
  const selectionError =
    requestedId && list.value && !selected
      ? text.itemNotFound
      : requestedVersionId && (lookup.value === null || (versions.value && !selectedVersion))
        ? text.versionNotFound
        : null;
  const selectItem = (id: string) => setParams({ id });
  const selectVersion = (id: string) => setParams({ id: selectedId, version: id });
  /**
   * 既定で開いた項目（一覧の先頭）をURLに書き、アーカイブなどで読み直して一覧の下に移っても、
   * 開いたままにする。
   */
  function pinSelectedItem() {
    if (requestedId || !selectedId) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('id', selectedId);
        return next;
      },
      { replace: true },
    );
  }
  function reload() {
    list.reload();
    versions.reload();
    lookup.reload();
  }
  return {
    list,
    lookup,
    selected,
    versions,
    selectedVersion,
    selectionError,
    selectItem,
    selectVersion,
    pinSelectedItem,
    reload,
  };
}
