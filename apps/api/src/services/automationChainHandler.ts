import type { Run } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { findExecutionForRun } from '../repositories/automationExecutionLookup.js';
import {
  hasExecutionForTriggerRun,
  insertAutomationExecution,
  lockAutomationRule,
  lockDownstreamRules,
} from '../repositories/modelAutomationRepository.js';
import { findModelVersion } from '../repositories/registryRepository.js';
import type { ModelAutomationService } from './modelAutomationService.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

// 下流のルールが起動しなかった理由。':'より前のコードはAPI契約の一部。
const UPSTREAM_SKIP_ERRORS = {
  unsuccessful: 'upstream_unsuccessful: 上流Runが成功しなかったため起動しません',
  outputsMissing: 'upstream_outputs_missing: 上流Runに出力DatasetVersionがないため起動しません',
} as const;

function upstreamSkipError(run: Pick<Run, 'status' | 'outputDatasetVersionIds'>): string | null {
  if (run.status !== 'finished') return UPSTREAM_SKIP_ERRORS.unsuccessful;
  if (run.outputDatasetVersionIds.length === 0) return UPSTREAM_SKIP_ERRORS.outputsMissing;
  return null;
}

/**
 * 終了したRunを作ったルールの後ろに連鎖させたルールを起動する。上流のルールはRunのtagからでなく、
 * 必ずmodel_automation_executions（人によるJobの再試行もたどる）から探すので、人が作った
 * Runからは連鎖が始まらない。（下流のルール、上流のRun）の組はそれぞれ1回だけ扱う。これで、
 * 完了が繰り返されたりMLflowで開き直して終えたりしても、段が重複しない。
 */
export class AutomationChainHandler implements RunCompletionHandler {
  readonly name = 'automation-chain';

  constructor(private readonly automation: ModelAutomationService) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    const { run } = change;
    const upstream = await findExecutionForRun(connection, {
      projectId: run.projectId,
      runId: run.id,
    });
    if (!upstream) return;
    const upstreamRule = await lockAutomationRule(connection, {
      projectId: run.projectId,
      id: upstream.ruleId,
      mode: 'share',
    });
    // 上流のルールが無効なら、それまでに起動したRunの分も含めて、そのパイプラインを止める。
    if (!upstreamRule?.enabled) return;
    const model = await findModelVersion(connection, {
      projectId: run.projectId,
      id: upstream.modelVersionId,
    });
    const rules = await lockDownstreamRules(connection, {
      projectId: run.projectId,
      ruleId: upstream.ruleId,
      family: model.family,
    });
    for (const rule of rules) {
      if (await hasExecutionForTriggerRun(connection, { ruleId: rule.id, triggerRunId: run.id }))
        continue;
      const skipError = upstreamSkipError(run);
      if (skipError) {
        await insertAutomationExecution(connection, {
          projectId: run.projectId,
          ruleId: rule.id,
          modelVersionId: model.id,
          status: 'skipped',
          error: skipError,
          triggerRunId: run.id,
          pipelineRootExecutionId: upstream.pipelineRootExecutionId,
        });
        continue;
      }
      await this.automation.executeRule(connection, {
        rule,
        model,
        trigger: {
          run,
          pipelineRootExecutionId: upstream.pipelineRootExecutionId,
          source: 'automatic',
          attempt: 1,
          requestedBy: null,
        },
      });
    }
  }
}
