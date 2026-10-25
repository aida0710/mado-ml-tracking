import type { ArtifactBackend, ProjectRole, ProjectVisibility } from './index.js';

/** Projectの作成時に、直接付与のメンバーとして加えるユーザー。 */
export interface ProjectMemberGrant {
  userId: string;
  role: ProjectRole;
}

/**
 * POST /projects。作成者がProject adminになる。visibilityの既定は'public'。Projectとメンバーは
 * まとめて作るので、存在しないユーザーや人でないユーザーが1人でもいると、リクエスト全体を拒む。
 * 作成者への付与は無視する（作成者は常にadmin）。
 */
export interface ProjectCreate {
  name: string;
  description?: string;
  artifactBackend?: ArtifactBackend;
  visibility?: ProjectVisibility;
  members?: ProjectMemberGrant[];
}

/** PATCH /projects/:p。Project adminか全体管理者が使う。 */
export interface ProjectPatch {
  description?: string;
  artifactBackend?: ArtifactBackend;
  visibility?: ProjectVisibility;
}

/**
 * 全体管理者から見たProject（GET /admin/projects）。
 * POST /projects/:p/archiveはProjectを隠してデータは残す。POST /admin/projects/:p/restoreで
 * 元に戻す。DELETE /admin/projects/:pはアーカイブ済みのProjectとそのデータを完全に消す。
 */
export interface AdminProject {
  id: string;
  name: string;
  description: string;
  artifactBackend: ArtifactBackend;
  visibility: ProjectVisibility;
  /**
   * 直接付与かgroupへの付与を持つユーザーの数（Service Accountを含む）。publicの公開設定による
   * アクセスは数えない。
   */
  memberCount: number;
  /** Project adminである人（Service Accountは除く）の表示名。名前の順。 */
  adminNames: string[];
  /** 有効な（MLflowで削除されていない）Runの数。 */
  runCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface AdminProjectQuery {
  /** これがtrueでなければ、アーカイブ済みのProjectは含めない。 */
  includeArchived?: boolean;
}
