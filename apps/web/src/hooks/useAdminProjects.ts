import { useState } from 'react';
import { adminProjectsApi } from '../api/adminProjects';
import { useQuery } from './useQuery';

/** 全体管理のProjectの一覧と、アーカイブしたProjectも出すかどうか。 */
export function useAdminProjects() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const projects = useQuery({ key: `admin-projects:${includeArchived}`, load: (signal) =>
    adminProjectsApi.list({ includeArchived }, signal),
  });
  return { projects, includeArchived, setIncludeArchived };
}
