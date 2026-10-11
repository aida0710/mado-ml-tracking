import type { CodeVersionDetail, ModelFamilySummary, RuleMetricKeys } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import {
  findCodeVersionDetail,
  findMetricKeyRule,
  listCodeVersionRunMetricKeys,
  listModelFamilies,
  listRuleRunMetricKeys,
} from '../repositories/registryLookupRepository.js';
import { requireProject } from './accessService.js';

/**
 * Read-only lookups the registry screens use to offer values instead of having them typed, and to
 * show a stored id by name. Every lookup is open to viewers with the `read` scope; creating
 * anything with the offered values keeps its own editor (or admin) check.
 */
export class RegistryLookupService {
  constructor(private readonly database: Database) {}

  async modelFamilies(principal: Principal, projectId: string): Promise<ModelFamilySummary[]> {
    await this.requireReader(principal, projectId);
    return listModelFamilies(this.database, projectId);
  }

  async codeVersionDetail(
    principal: Principal,
    reference: { projectId: string; id: string },
  ): Promise<CodeVersionDetail> {
    await this.requireReader(principal, reference.projectId);
    return findCodeVersionDetail(this.database, reference);
  }

  /**
   * The metric keys the rule's Runs recorded. Before the rule has produced a Run with metrics, the
   * Runs of the same kind that used its code version stand in, since they run the same code.
   */
  async ruleMetricKeys(
    principal: Principal,
    reference: { projectId: string; ruleId: string },
  ): Promise<RuleMetricKeys> {
    await this.requireReader(principal, reference.projectId);
    const rule = {
      projectId: reference.projectId,
      ...(await findMetricKeyRule(this.database, reference)),
    };
    const ruleKeys = await listRuleRunMetricKeys(this.database, rule);
    if (ruleKeys.length) return { items: ruleKeys, source: 'rule_runs' };
    const codeVersionKeys = await listCodeVersionRunMetricKeys(this.database, rule);
    if (codeVersionKeys.length) return { items: codeVersionKeys, source: 'code_version_runs' };
    return { items: [], source: 'none' };
  }

  private async requireReader(principal: Principal, projectId: string): Promise<void> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
  }
}
