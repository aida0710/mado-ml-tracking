import type { WorkflowExecutionSummary } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { shortId } from '../lib/jobDisplay';
import { useAuth } from './useAuth';
import { useQuery } from './useQuery';

/**
 * Who started an execution, by name: the signed-in user's own name, else the Project member's.
 * Someone who is not a member (an editor of a Public Project through no grant) shows as the first
 * block of their id, as Jobs do for a creator whose name is unknown.
 */
export function useWorkflowCreatorName(
  projectId: string,
  execution: Pick<WorkflowExecutionSummary, 'createdBy'>,
): string {
  const { user } = useAuth();
  const isOwn = execution.createdBy === user.id;
  const members = useQuery(isOwn ? null : `${projectId}:members`, (signal) =>
    accessApi.members(projectId, signal),
  );
  if (isOwn) return user.displayName;
  return (
    members.value?.find((member) => member.user.id === execution.createdBy)?.user.displayName ??
    shortId(execution.createdBy)
  );
}
