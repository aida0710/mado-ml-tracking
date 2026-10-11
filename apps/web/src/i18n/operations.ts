import * as english from './en/operations';
import { localized } from './localized';
import type { OperationsAlertKind } from '@mmt/contracts';

// The operations alert badge in the header and the plugin delivery status.
export const operationsText = localized({
  operationsAlerts: '運用アラート',
  operationsAlertsNone: '開いている運用アラートはありません',
  operationsAlertsLoadFailed: '運用アラートを読み込めませんでした',
  operationsAlertOpenedAt: '検知',
  operationsAlertsScope:
    'メンバーになっているプロジェクトのアラートです（全体管理者はすべてのプロジェクト）。',
  operationsAlertUnknownProject: '（読み込み中のプロジェクト）',
  pluginOutbox: 'イベントの送信状況',
  pluginOutboxPending: '未送信',
  pluginOutboxSending: '送信中',
  pluginOutboxOldestPending: '最古の未送信',
  pluginOutboxMaxAttempts: '最多の試行回数',
  pluginOutboxLastError: '最終エラー',
  pluginOutboxLastDelivered: '最終送信',
  pluginOutboxStalled:
    '送信が滞留しています（15分以上未送信、または5回以上失敗）。連携の状態を確認し、復旧後に「イベントを再送」を押してください。',
} as const, english.operationsText);

export const operationsAlertKindLabels: Record<OperationsAlertKind, string> = localized({
  'job.heartbeat_stale': 'Jobのheartbeat途絶',
  'worker.offline': 'workerの停止',
  'plugin.delivery_stalled': '連携の送信滞留',
}, english.operationsAlertKindLabels);

export const operationsTextTemplates = localized({
  operationsAlertCount: (count: number) => `運用アラート ${count}件`,
  // The bell got as many alerts as one request returns, so more may be open.
  operationsAlertCountAtLeast: (count: number) => `運用アラート ${count}件以上`,
  operationsAlertBadgeAtLeast: (count: number) => `${count}+`,
}, english.operationsTextTemplates);
