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
 * レジストリの画面が、値を入力させる代わりに選択肢として出したり、保存されたidを名前で表示
 * したりするための読み取り専用の参照。どの参照も`read` scopeを持つviewerに開いている。出した
 * 値を使って何かを作るときは、それぞれのeditor（またはadmin）の確認がそのまま効く。
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
   * ルールのRunが記録したメトリクスのキー。ルールがメトリクスを持つRunをまだ作っていない間は、
   * 同じ種類でそのコードバージョンを使ったRunで代える。同じコードを動かしているため。
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
