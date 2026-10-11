import type { Code, CodeVersionDetail, ModelFamilySummary, RunKind } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import { MAX_RETRY_CHAIN_LENGTH } from './automationExecutionLookup.js';
import { runProducedByRuleCondition } from './evaluationRunRepository.js';
import { codeSelect, findCodeVersion } from './registryRepository.js';

// Metric keys come from this many of the newest Runs: a key the newest Runs no longer record is
// unlikely to be what a new promotion criterion wants, and the scan stays bounded.
export const METRIC_KEY_RUN_SAMPLE = 200;
// The keys only help typing a criterion; past this many, the first ones by name are offered.
export const MAX_METRIC_KEYS = 500;

/**
 * Every family the Project uses, with how many Models have it and how many code versions list it.
 * Sorted case-insensitively, so `Qwen3` and `qwen3` sit next to each other (capitals first).
 */
export function listModelFamilies(
  connection: Connection,
  projectId: string,
): Promise<ModelFamilySummary[]> {
  return rows<ModelFamilySummary>(
    connection,
    `SELECT name, sum(model_count)::int AS model_count, sum(code_version_count)::int AS code_version_count
    FROM (
      SELECT family AS name, 1 AS model_count, 0 AS code_version_count
      FROM models WHERE project_id=$1
      UNION ALL
      SELECT family.name, 0, 1
      FROM code_versions v
      CROSS JOIN LATERAL (SELECT DISTINCT unnest(v.supported_model_families) AS name) family
      WHERE v.project_id=$1
    ) uses
    GROUP BY name
    ORDER BY lower(name), name COLLATE "C"`,
    [projectId],
  );
}

export async function findCodeVersionDetail(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<CodeVersionDetail> {
  const version = await findCodeVersion(connection, reference);
  const code = await first<Code>(connection, `${codeSelect} WHERE c.project_id=$1 AND c.id=$2`, [
    reference.projectId,
    version.codeId,
  ]);
  if (!code) notFound('Code');
  return { code, version };
}

export interface MetricKeyRule {
  id: string;
  kind: RunKind;
  codeVersionId: string;
}

export async function findMetricKeyRule(
  connection: Connection,
  reference: { projectId: string; ruleId: string },
): Promise<MetricKeyRule> {
  const rule = await first<MetricKeyRule>(
    connection,
    'SELECT id,kind,code_version_id FROM model_automation_rules WHERE project_id=$1 AND id=$2',
    [reference.projectId, reference.ruleId],
  );
  if (!rule) notFound('ModelAutomationRule');
  return rule;
}

// The keys of the newest active Runs of a kind that satisfy `runCondition` (on Run `r`, with its
// own parameters from $5 on), sorted by name.
function recentRunMetricKeysSql(runCondition: string): string {
  return `SELECT DISTINCT key FROM (
    SELECT r.latest_metrics FROM runs r
    WHERE r.project_id=$1 AND r.kind=$2 AND r.lifecycle_stage='active' AND ${runCondition}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT $3
  ) recent
  CROSS JOIN LATERAL jsonb_object_keys(recent.latest_metrics) AS key
  ORDER BY key
  LIMIT $4`;
}

/** Metric keys of the Runs the rule's automation produced, manual retries of their Jobs included. */
export async function listRuleRunMetricKeys(
  connection: Connection,
  rule: { projectId: string } & MetricKeyRule,
): Promise<string[]> {
  const found = await rows<{ key: string }>(
    connection,
    recentRunMetricKeysSql(runProducedByRuleCondition({ ruleId: '$5', maxChainLength: '$6' })),
    [
      rule.projectId,
      rule.kind,
      METRIC_KEY_RUN_SAMPLE,
      MAX_METRIC_KEYS,
      rule.id,
      MAX_RETRY_CHAIN_LENGTH,
    ],
  );
  return found.map((row) => row.key);
}

/** Metric keys of the Runs of the rule's kind that used its code version, by hand or otherwise. */
export async function listCodeVersionRunMetricKeys(
  connection: Connection,
  rule: { projectId: string } & MetricKeyRule,
): Promise<string[]> {
  const found = await rows<{ key: string }>(
    connection,
    recentRunMetricKeysSql('r.code_version_id=$5::uuid'),
    [rule.projectId, rule.kind, METRIC_KEY_RUN_SAMPLE, MAX_METRIC_KEYS, rule.codeVersionId],
  );
  return found.map((row) => row.key);
}
