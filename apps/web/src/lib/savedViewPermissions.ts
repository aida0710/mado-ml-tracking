import type { ProjectRole, SavedView, SavedViewVisibility } from '@mmt/contracts';
import { canEditProject, canManageProject } from './permissions';

// APIのsavedViewServiceに合わせ、APIが403で拒む操作をメニューに出さない。メンバーでない
// 全体管理者は、`role`がadminになる。

export interface SavedViewActor {
  userId: string;
  role: ProjectRole;
}

/** Projectへの共有にはeditorのロールが要る。自分用にビューを持つのは誰でもできる。 */
export function savedViewVisibilityChoices(role: ProjectRole): SavedViewVisibility[] {
  return canEditProject(role) ? ['private', 'project'] : ['private'];
}

/** 状態の上書きと名前の変更。所有者か、共有されたビューならProject adminができる。 */
export function canChangeSavedView(view: SavedView, actor: SavedViewActor): boolean {
  if (view.ownerUserId === actor.userId)
    return view.visibility === 'private' || canEditProject(actor.role);
  return view.visibility === 'project' && canManageProject(actor.role);
}

/** 公開範囲を変えられるのは所有者だけ。Project adminは名前を変えられるが、隠せない。 */
export function canChangeSavedViewVisibility(view: SavedView, actor: SavedViewActor): boolean {
  return view.ownerUserId === actor.userId;
}

/** ロールにかかわらず所有者か、共有されたビューならProject admin。 */
export function canDeleteSavedView(view: SavedView, actor: SavedViewActor): boolean {
  return (
    view.ownerUserId === actor.userId ||
    (view.visibility === 'project' && canManageProject(actor.role))
  );
}
