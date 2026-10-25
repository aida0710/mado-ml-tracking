import type { Project } from '@mmt/contracts';

// このブラウザで最後に開いたProject。"/"（アプリ名を押すか、全体設定を出るとき）で、最新の
// Projectではなくこれを開き直す。このアプリのキーは"mmt."で始める。
const LAST_PROJECT_STORAGE_KEY = 'mmt.lastProject';

export function readLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    // ストレージが使えないことがある。そのときの"/"は、利用者がメンバーである最初のProjectを開く。
    return null;
  }
}

export function rememberLastProjectId(projectId: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
  } catch {
    /* 覚えておくのは便利のためで、無くてもアプリは動く。 */
  }
}

/**
 * "/"が開くProject。最後に開いたものを利用者がまだ開けるならそれ、無ければ利用者が（直接かgroup
 * 経由で）メンバーである最新のもの。公開されているから、または全体管理者だからというだけで届く
 * Projectには自分からは入らない。初めてログインした人が、知らない人のProjectに着いてしまうため。
 * undefinedなら"/"はProjectの一覧のまま。
 */
export function projectToOpen(projects: Project[], lastProjectId: string | null): Project | undefined {
  return (
    projects.find((project) => project.id === lastProjectId) ??
    projects.find((project) => project.isMember)
  );
}
