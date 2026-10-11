// The read-only registry lookups of packages/contracts/src/registryLookups.ts for browser checks,
// computed from the mock's state by the rules of apps/api/src/repositories/registryLookupRepository.ts.

const byLowerNameThenName = (left, right) => {
  const [leftLower, rightLower] = [left.name.toLowerCase(), right.name.toLowerCase()];
  if (leftLower !== rightLower) return leftLower < rightLower ? -1 : 1;
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
};

/**
 * GET /projects/:p/model-families: every family the Models have or the code versions list, with
 * how many of each use it, sorted case-insensitively so `Qwen3` sits next to `qwen3`.
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

/** GET /projects/:p/code-versions/:id: the version with its code, or null when either is missing. */
export function findCodeVersionDetail(state, versionId) {
  const version = state.codeVersions.find((item) => item.id === versionId);
  const code = version && state.codes.find((item) => item.id === version.codeId);
  return code ? { code, version } : null;
}

const sortedMetricKeys = (runs) => [...new Set(runs.flatMap((run) => Object.keys(run.latestMetrics)))].sort();

/**
 * GET /projects/:p/automation-rules/:id/metric-keys: the keys the Runs the rule's executions
 * started recorded; before they recorded any, the keys of the Runs of the rule's kind that used its
 * code version.
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
