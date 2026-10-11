import type { Code, CodeVersion } from './index.js';

/**
 * GET /projects/:p/model-families: a model family the Project already uses, as a Model's family or
 * in a code version's supported families. Screens offer these so one family is not typed in two
 * spellings (`Qwen3` beside `qwen3`), which would keep the code from matching the model.
 */
export interface ModelFamilySummary {
  name: string;
  modelCount: number;
  codeVersionCount: number;
}

/** GET /projects/:p/code-versions/:id: a code version with its code, to show it by name. */
export interface CodeVersionDetail {
  code: Code;
  version: CodeVersion;
}

/**
 * Where the keys of GET /projects/:p/automation-rules/:id/metric-keys came from. rule_runs: Runs the
 * rule's automation produced (manual retries of their Jobs included). code_version_runs: the rule
 * has produced none with metrics yet, so Runs of the same kind that used the rule's code version.
 * none: neither has recorded a metric.
 */
export type RuleMetricKeySource = 'rule_runs' | 'code_version_runs' | 'none';

/** Metric keys the latest Runs recorded, sorted; offered when writing promotion criteria. */
export interface RuleMetricKeys {
  items: string[];
  source: RuleMetricKeySource;
}
