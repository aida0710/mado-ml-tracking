import { useEffect, useState } from 'react';
import { administrationApi } from '../api/administration';
import { RequestError } from '../api/http';

/** archived: メンバー（または全体管理者）が開けるはずのProjectがアーカイブされている。 */
export type UnreachableProjectReason = 'archived' | 'unavailable';

// アーカイブしたProjectについて、開けるはずの人にAPIが返す答え（accessService.ts）。
const PROJECT_ARCHIVED_CODE = 'project_archived';

/**
 * URLのProjectを開けない理由を、APIに1回だけ問い合わせる。アーカイブされた、または無い／
 * 共有されていない（APIはこの2つを区別しない）。問い合わせ中や、Projectのidが無いときはnull。
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
      // 結局は開けた（一覧がURLより古かった）。それ以上具体的に言えることは無い。
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
