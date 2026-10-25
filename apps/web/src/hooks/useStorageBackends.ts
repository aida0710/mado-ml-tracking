import type { StorageBackendKind } from '@mmt/contracts';
import { storageApi } from '../api/storage';
import { useAuth } from './useAuth';
import { useQuery } from './useQuery';
import { isGlobalAdmin } from '../lib/permissions';

/** The admin tab's data: every backend and the default for new Projects. */
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
  /** Only global administrators can read kinds, so other users see names alone. */
  kind?: StorageBackendKind;
}

/** Backends a Project may pick, with the default a new Project starts from. */
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
