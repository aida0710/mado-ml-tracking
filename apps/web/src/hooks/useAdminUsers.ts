import { useState } from 'react';
import type { AdminUserQuery } from '@mmt/contracts';
import { adminUsersApi } from '../api/adminUsers';
import { useQuery } from './useQuery';

/** 全体管理のユーザーのタブの一覧と、それを読み込んだときの絞り込み。 */
export function useAdminUsers() {
  const [filter, setFilter] = useState<AdminUserQuery>({});
  const users = useQuery({ key: `admin-users:${JSON.stringify(filter)}`, load: (signal) =>
    adminUsersApi.list(filter, signal),
  });
  return { users, filter, setFilter };
}
