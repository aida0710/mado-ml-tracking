import type {
  ModelAliasProtection,
  ModelAliasProtectionRole,
  ProjectRole,
  PromotionEvaluation,
  PromotionPolicy,
} from '@mmt/contracts';

// APIのaliasの保護の検査（aliasProtectionService.manualAliasGuard）に合わせ、昇格のダイアログで
// APIが求めるものを入力させる。判断の正本はAPIのまま。

/** 当てはまる保護をすべて合わせたときに、1つのaliasを手で変えるのに満たすべき条件。 */
export interface EffectiveAliasProtection {
  requiredRole: ModelAliasProtectionRole;
  requirePassedEvaluation: boolean;
}

/** Project全体の保護とモデルの保護は、設定ごとに厳しい方を取って合わせる。 */
export function effectiveAliasProtection(
  protections: readonly ModelAliasProtection[],
  target: { modelId: string; alias: string },
): EffectiveAliasProtection | null {
  const matching = protections.filter(
    (protection) =>
      protection.alias === target.alias &&
      (protection.modelId === null || protection.modelId === target.modelId),
  );
  if (!matching.length) return null;
  return {
    requiredRole: matching.some((protection) => protection.requiredRole === 'admin')
      ? 'admin'
      : 'editor',
    requirePassedEvaluation: matching.some((protection) => protection.requirePassedEvaluation),
  };
}

export function meetsProtectionRole(
  role: ProjectRole,
  protection: EffectiveAliasProtection | null,
): boolean {
  if (!protection) return true;
  return protection.requiredRole === 'editor' ? role !== 'viewer' : role === 'admin';
}

/**
 * 保護されたaliasを外すのに要るロール。保護のロールだが、保護が合格の判定を求めるならadminに
 * 上げる。外すことを正当化できる判定は無いため。
 */
export function roleToRemoveAlias(protection: EffectiveAliasProtection): ModelAliasProtectionRole {
  return protection.requirePassedEvaluation ? 'admin' : protection.requiredRole;
}

export function canRemoveAlias(
  role: ProjectRole,
  protection: EffectiveAliasProtection | null,
): boolean {
  return (
    !protection ||
    meetsProtectionRole(role, { ...protection, requiredRole: roleToRemoveAlias(protection) })
  );
}

/**
 * そのaliasを対象にするpolicyでの、そのバージョンについての現在の判定。同じ候補のRunを後から
 * 判定し直したものは、APIの判断と同じく前の判定を置き換える。
 */
export function currentDecisionsForAlias(
  decisions: readonly PromotionEvaluation[],
  context: { policies: readonly PromotionPolicy[]; alias: string; versionId: string },
): PromotionEvaluation[] {
  const policyIds = new Set(
    context.policies
      .filter((policy) => policy.targetAlias === context.alias)
      .map((policy) => policy.id),
  );
  const latest = new Map<string, PromotionEvaluation>();
  for (const decision of decisions) {
    if (!policyIds.has(decision.policyId) || decision.candidateVersionId !== context.versionId)
      continue;
    const key = `${decision.policyId}:${decision.candidateRunId}`;
    if ((latest.get(key)?.sequence ?? 0) < decision.sequence) latest.set(key, decision);
  }
  return [...latest.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * ダイアログで集めるべきもの。保護されたaliasには、保護がそう求めるなら合格の判定が要り、そうで
 * なければ判定を挙げないときに理由が要る。昇格の検査に落ちたバージョンへaliasを動かすときは、
 * どのaliasでも理由が要る。それでも昇格させた理由を履歴に残すため。
 */
export function promotionEvidenceRequirement(state: {
  protection: EffectiveAliasProtection | null;
  decisions: readonly PromotionEvaluation[];
  evaluationId: string;
}): { evaluationRequired: boolean; reasonRequired: boolean } {
  const evaluationRequired = state.protection?.requirePassedEvaluation === true;
  const failedCheck = state.decisions.some((decision) => decision.decision === 'failed');
  return {
    evaluationRequired,
    reasonRequired: !state.evaluationId && (state.protection !== null || failedCheck),
  };
}

/**
 * policyの基準aliasが、判定のときに比べたバージョンとは別のバージョンを今指しているか。例えば、
 * 初回のリリースでの合格（基準なし）の後に、新しいバージョンがproductionになったとき。そうした
 * 合格は今の基準について何も言えないので、根拠として出さない。APIはそれでも受け付ける
 * （aliasProtectionService.requirePassedEvidenceは判定だけを確かめる）。
 */
export function hasBaselineMoved(
  decision: Pick<PromotionEvaluation, 'baselineVersionId'>,
  context: { policy: Pick<PromotionPolicy, 'baselineAlias'>; aliases: Record<string, string> },
): boolean {
  return decision.baselineVersionId !== (context.aliases[context.policy.baselineAlias] ?? null);
}
