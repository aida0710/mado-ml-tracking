import { useEffect, useState } from 'react';
import { administrationApi } from '../api/administration';
import { RequestError } from '../api/http';

/** archived: a member's (or a global administrator's) archived Project. */
export type UnreachableProjectReason = 'archived' | 'unavailable';

// The API's answer for an archived Project to those who could open it (accessService.ts).
const PROJECT_ARCHIVED_CODE = 'project_archived';

/**
 * Why the Project in the URL cannot be opened, asked of the API once: archived, or missing /
 * not shared (which the API does not tell apart). Null while asking, or without a Project id.
 */
export function useUnreachableProjectReason(
  projectId: string | undefined,
): UnreachableProjectReason | null {
  const [answer, setAnswer] = useState<{
    projectId: string;
    reason: UnreachableProjectReason;
  } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    administrationApi.project(projectId, controller.signal).then(
      // Openable after all (the list was older than the URL): nothing more specific to say.
      () => setAnswer({ projectId, reason: 'unavailable' }),
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        const isArchived =
          failure instanceof RequestError && failure.code === PROJECT_ARCHIVED_CODE;
        setAnswer({ projectId, reason: isArchived ? 'archived' : 'unavailable' });
      },
    );
    return () => controller.abort();
  }, [projectId]);
  return answer && answer.projectId === projectId ? answer.reason : null;
}
