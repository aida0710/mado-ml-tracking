import type {
  ServiceAccountCreate,
  ServiceAccountTokenCreate,
  ServiceAccountUpdate,
} from '@mmt/contracts';
import { accessApi } from '../api/access';
import { useQuery } from './useQuery';

/**
 * ProjectのService Accountと、そのtokenを出すProjectのtokenの一覧。どちらもProject adminの画面
 * なので、`isProjectAdmin`がfalseなら何も要求しない。
 */
export function useServiceAccounts(projectId: string, isProjectAdmin: boolean) {
  const serviceAccounts = useQuery({
    key: isProjectAdmin ? `${projectId}:service-accounts` : null,
    load: (signal) => accessApi.serviceAccounts(projectId, signal),
  });
  const projectTokens = useQuery({ key: isProjectAdmin ? `${projectId}:project-tokens` : null, load: (signal) =>
    accessApi.projectTokens(projectId, signal),
  });
  return {
    serviceAccounts,
    projectTokens,
    createServiceAccount: (body: ServiceAccountCreate) =>
      accessApi.createServiceAccount(projectId, body),
    updateServiceAccount: (serviceAccountId: string, body: ServiceAccountUpdate) =>
      accessApi.updateServiceAccount(projectId, serviceAccountId, body),
    issueServiceAccountToken: (serviceAccountId: string, body: ServiceAccountTokenCreate) =>
      accessApi.createServiceAccountToken(projectId, serviceAccountId, body),
  };
}

export type ServiceAccountsState = ReturnType<typeof useServiceAccounts>;
