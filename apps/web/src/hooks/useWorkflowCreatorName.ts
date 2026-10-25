import type { WorkflowExecutionSummary } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { shortId } from '../lib/jobDisplay';
import { useAuth } from './useAuth';
import { useQuery } from './useQuery';

/**
 * 実行を始めた人の名前。ログイン中の利用者なら本人の名前、そうでなければProjectのメンバーの名前。
 * メンバーでない人（権限の付与なしでPublicなProjectを編集する人）は、Jobで名前の分からない作成者と
 * 同じく、idの先頭の区切りまでを出す。
 */
export function useWorkflowCreatorName(
  projectId: string,
  execution: Pick<WorkflowExecutionSummary, 'createdBy'>,
): string {
  const { user } = useAuth();
  const isOwn = execution.createdBy === user.id;
  const members = useQuery({ key: isOwn ? null : `${projectId}:members`, load: (signal) =>
    accessApi.members(projectId, signal),
  });
  if (isOwn) return user.displayName;
  return (
    members.value?.find((member) => member.user.id === execution.createdBy)?.user.displayName ??
    shortId(execution.createdBy)
  );
}
