/**
 * aliasの変更の出どころ。version_deletedとmodel_deletedは、対象のModelVersionか登録モデルが
 * MLflowで削除されたために、サーバーが行う取り外し。
 */
export type ModelAliasEventSource =
  'web' | 'api' | 'mlflow' | 'promotion_policy' | 'version_deleted' | 'model_deleted';

/**
 * 追記だけのaliasの変更1件。versionIdがnullなら取り外し、previousVersionIdがnullなら最初の
 * 割り当て。
 */
export interface ModelAliasEvent {
  id: string;
  projectId: string;
  modelId: string;
  alias: string;
  previousVersionId: string | null;
  /** previousVersionIdのバージョン名（"3"など）。 */
  previousVersion: string | null;
  versionId: string | null;
  version: string | null;
  source: ModelAliasEventSource;
  reason: string;
  promotionEvaluationId: string | null;
  /** ユーザーによらない変更（migrationが記録したスナップショットと、システムの変更）ではnull。 */
  actor: { userId: string; displayName: string; tokenId: string | null } | null;
  createdAt: string;
}

/** aliasの変更のkeysetページングの1ページ（新しい順）。nextCursorは次に`cursor`として渡すid。 */
export interface ModelAliasEventPage {
  items: ModelAliasEvent[];
  nextCursor: string | null;
}

/** PUT /projects/:p/models/:id/aliases/:aliasの本文。 */
export interface ModelAliasAssignment {
  versionId: string;
  reason?: string;
  /**
   * このaliasとバージョンについての、合格した昇格の判定。変更の根拠として記録する。
   * requirePassedEvaluationで保護したaliasでは必須。
   */
  evaluationId?: string;
}

/** 保護したaliasを手で変更できる、今のProjectのroleのうち最も弱いもの。 */
export type ModelAliasProtectionRole = 'editor' | 'admin';

/**
 * aliasの手動の変更を制限する。modelIdがnullなら、Projectのすべての登録モデルでそのaliasを
 * 保護する。Project全体と登録モデルの保護の両方が一致したときは、項目ごとに厳しい方を
 * 適用する。MLflow互換のAPIからの変更は、理由も昇格の判定も渡せないので常に拒む
 * （PERMISSION_DENIED）。
 */
export interface ModelAliasProtection {
  id: string;
  projectId: string;
  modelId: string | null;
  alias: string;
  requiredRole: ModelAliasProtectionRole;
  /** 手動の割り当てには、このaliasとバージョンについての合格した判定（evaluationId）が要る。 */
  requirePassedEvaluation: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** PUT /projects/:p/alias-protections/:alias?modelId=の本文。 */
export interface ModelAliasProtectionInput {
  requiredRole: ModelAliasProtectionRole;
  requirePassedEvaluation?: boolean;
}
