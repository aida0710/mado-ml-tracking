import type { ModelAutomationRule, ModelVersion } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { enqueueNotificationEvent } from './notificationEvents.js';

/** Runを始めずに終わった実行。ルールがそのバージョンに対して動けなかった。 */
export interface UnstartedAutomationExecution {
  executionId: string;
  rule: Pick<ModelAutomationRule, 'id' | 'name' | 'kind' | 'experimentId'>;
  model: Pick<ModelVersion, 'id' | 'modelId' | 'projectId' | 'version'>;
  status: 'failed' | 'skipped';
  // '<code>: <message>'の形で保存する。通知に入れるのはコードだけ。
  error: string;
}

/**
 * 呼び出し側のトランザクションの中でautomation.failedをキューに入れる。subjectにはルールの
 * Runの種類と実験を入れるので、それで絞り込んだ通知ルールは、Runが無くても一致する。
 */
export async function enqueueAutomationFailure(
  connection: Connection,
  failure: UnstartedAutomationExecution & { webOrigin: string },
): Promise<void> {
  const { rule, model } = failure;
  await enqueueNotificationEvent(connection, {
    projectId: model.projectId,
    type: 'automation.failed',
    dedupeKey: `automation.failed:${failure.executionId}`,
    subject: {
      runKind: rule.kind,
      experimentId: rule.experimentId,
      isAutomation: async () => true,
    },
    describe: async () => ({
      title: `自動実行を開始できませんでした: ${rule.name}`,
      run: null,
      details: {
        executionId: failure.executionId,
        ruleId: rule.id,
        ruleName: rule.name,
        modelVersionId: model.id,
        modelVersion: model.version,
        status: failure.status,
        reason: failure.error.split(':', 1)[0]!,
      },
      url: `${failure.webOrigin}/projects/${encodeURIComponent(model.projectId)}/models/${encodeURIComponent(model.modelId)}/versions/${encodeURIComponent(model.id)}`,
    }),
  });
}
