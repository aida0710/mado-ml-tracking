import type { StorageBackendKind } from '@mmt/contracts';
import { storageApi } from '../api/storage';
import { useAuth } from './useAuth';
import { useQuery } from './useQuery';
import { isGlobalAdmin } from '../lib/permissions';

/** 全体管理のタブのデータ。すべての保存先と、新しいProjectの既定の保存先。 */
export function useStorageBackends() {
  const backends = useQuery({ key: 'admin-storage-backends', load: storageApi.backends });
  const settings = useQuery({ key: 'admin-storage-settings', load: storageApi.settings });
  return {
    backends,
    settings,
    reload: () => {
      backends.reload();
      settings.reload();
    },
  };
}

export interface StorageBackendChoice {
  name: string;
  /** 種類を読めるのは全体管理者だけなので、ほかの利用者には名前だけが見える。 */
  kind?: StorageBackendKind;
}

/** Projectが選べる保存先と、新しいProjectが最初に使う既定の保存先。 */
export function useStorageBackendChoices() {
  const auth = useAuth();
  const choices = useQuery({ key: 'storage-backend-choices', load: storageApi.choices });
  const details = useQuery({
    key: isGlobalAdmin(auth.user) ? 'storage-backend-choice-details' : null,
    load: storageApi.backends,
  });
  const kinds = new Map(details.value?.map((backend) => [backend.name, backend.kind]));
  return {
    ...choices,
    value: choices.value && {
      defaultBackend: choices.value.defaultBackend,
      items: choices.value.items.map((name): StorageBackendChoice => ({
        name,
        kind: kinds.get(name),
      })),
    },
  };
}
