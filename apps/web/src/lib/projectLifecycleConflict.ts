import { RequestError } from '../api/http';
import { text } from '../i18n/catalog';

// Projectのアーカイブと完全な削除で返る409のコード。サーバーの文でなく、次に何をすればよいかを
// 示す。
const conflictText: Record<string, string> = {
  get project_has_active_jobs() { return text.projectHasActiveJobs; },
  get project_not_archived() { return text.projectNotArchived; },
};

/** アーカイブか完全な削除の要求を実行し、既知の競合を画面の言葉で説明する。 */
export async function explainProjectLifecycleConflict<T>(change: Promise<T>): Promise<T> {
  try {
    return await change;
  } catch (failure) {
    const known =
      failure instanceof RequestError && failure.status === 409 && failure.code
        ? conflictText[failure.code]
        : undefined;
    if (known) throw new Error(known, { cause: failure });
    throw failure;
  }
}
