import { useState } from 'react';
import { adminProjectsApi } from '../api/adminProjects';
import { useQuery } from './useQuery';

/** The admin Project list, and whether it also shows archived Projects. */
export function useAdminProjects() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const projects = useQuery({ key: `admin-projects:${includeArchived}`, load: (signal) =>
    adminProjectsApi.list({ includeArchived }, signal),
  });
  return { projects, includeArchived, setIncludeArchived };
}
