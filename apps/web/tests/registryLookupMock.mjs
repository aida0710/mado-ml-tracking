// packages/contracts/src/registryLookups.tsの読み取り専用のレジストリ参照を、ブラウザでの確認用に、
// apps/api/src/repositories/registryLookupRepository.tsの規則でモックの状態から計算する。

const byLowerNameThenName = (left, right) => {
  const [leftLower, rightLower] = [left.name.toLowerCase(), right.name.toLowerCase()];
  if (leftLower !== rightLower) return leftLower < rightLower ? -1 : 1;
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
};

/**
 * GET /projects/:p/model-families: モデルが持つか、コードバージョンが挙げるすべてのモデル系列と、
 * それぞれを使っている数。大文字小文字を区別せずに並べるので、`Qwen3`は`qwen3`の隣に来る。
 */
export function listModelFamilies(state) {
  const families = new Map();
  const count = (name, field) => {
    const family = families.get(name) ?? { name, modelCount: 0, codeVersionCount: 0 };
    family[field] += 1;
    families.set(name, family);
  };
  state.models.forEach((model) => count(model.family, 'modelCount'));
  state.codeVersions.forEach((version) =>
    new Set(version.supportedModelFamilies).forEach((name) => count(name, 'codeVersionCount')),
  );
  return [...families.values()].sort(byLowerNameThenName);
}

/** GET /projects/:p/code-versions/:id: コードと組にしたバージョン。どちらかが無ければnull。 */
export function findCodeVersionDetail(state, versionId) {
  const version = state.codeVersions.find((item) => item.id === versionId);
  const code = version && state.codes.find((item) => item.id === version.codeId);
  return code ? { code, version } : null;
}

const sortedMetricKeys = (runs) => [...new Set(runs.flatMap((run) => Object.keys(run.latestMetrics)))].sort();

/**
 * GET /projects/:p/automation-rules/:id/metric-keys: その自動実行ルールの実行が始めたRunが記録した
 * キー。まだ何も記録していなければ、ルールの種類のRunのうち、ルールのコードバージョンを使ったものの
 * キー。
 */
export function ruleMetricKeys(state, rule) {
  const ruleRunIds = new Set(
    state.automationExecutions
      .filter((execution) => execution.ruleId === rule.id && execution.runId)
      .map((execution) => execution.runId),
  );
  const ruleKeys = sortedMetricKeys(
    state.runs.filter((run) => ruleRunIds.has(run.id) && run.kind === rule.kind),
  );
  if (ruleKeys.length) return { items: ruleKeys, source: 'rule_runs' };
  const codeVersionKeys = sortedMetricKeys(
    state.runs.filter((run) => run.kind === rule.kind && run.codeVersionId === rule.codeVersionId),
  );
  if (codeVersionKeys.length) return { items: codeVersionKeys, source: 'code_version_runs' };
  return { items: [], source: 'none' };
}
