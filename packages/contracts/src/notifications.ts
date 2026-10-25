import type { RunKind, RunStatus } from './index.js';

export type NotificationChannelKind = 'slack_webhook' | 'webhook' | 'email';

/**
 * ルールが購読できるイベント。run.*はRunの完了のハンドラがキューに入れ、それ以外は、それを
 * 検知する監視と自動実行の機能がキューに入れる。
 */
export type NotificationEventType =
  | 'run.failed'
  | 'run.canceled'
  | 'run.finished'
  | 'automation.failed'
  | 'job.heartbeat_stale'
  | 'job.heartbeat_recovered'
  | 'worker.offline'
  | 'plugin.delivery_stalled';

export const NOTIFICATION_EVENT_TYPES: readonly NotificationEventType[] = [
  'run.failed',
  'run.canceled',
  'run.finished',
  'automation.failed',
  'job.heartbeat_stale',
  'job.heartbeat_recovered',
  'worker.offline',
  'plugin.delivery_stalled',
];

/** 通知先が参照できる環境変数の名前は、この接頭辞で始まらなければならない。 */
export const NOTIFICATION_ENV_PREFIX = 'MMT_NOTIFICATION_';
/** 1つの通知先のメールの宛先の上限。notification_channelsのCHECKと同じ。 */
export const NOTIFICATION_RECIPIENTS_MAX = 50;

/**
 * 通知先。webhookのURLと署名のシークレットは保存しない。urlEnvとsecretEnvはサーバーの環境変数の
 * 名前で、configuredはそれらの変数が設定されているかを示す。メールの通知先はrecipientsに
 * NOTIFICATION_RECIPIENTS_MAX件までのアドレス（表示名なし）を並べ、サーバーにMMT_SMTP_URLと
 * MMT_SMTP_FROMがある間だけconfiguredになる。projectIdがnullなら、すべてのProjectのルールが
 * この通知先を使える。
 */
export interface NotificationChannel {
  id: string;
  projectId: string | null;
  kind: NotificationChannelKind;
  name: string;
  urlEnv: string | null;
  secretEnv: string | null;
  recipients: string[];
  enabled: boolean;
  configured: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface NotificationChannelCreate {
  projectId?: string | null;
  kind: NotificationChannelKind;
  name: string;
  urlEnv?: string | null;
  secretEnv?: string | null;
  recipients?: string[];
  enabled?: boolean;
}
/** 既存のルールが有効な通知先を持ち続けるよう、kindとprojectIdは作成時に決まる。 */
export type NotificationChannelPatch = Partial<
  Omit<NotificationChannelCreate, 'kind' | 'projectId'>
>;

/**
 * 選んだ種類のイベントのうち、送るものを絞り込む。指定した条件はすべて満たす必要がある。
 * Runについての条件（runKinds、experimentIds）は、Runの無いイベントには一致しない。
 */
export interface NotificationRuleFilter {
  runKinds?: RunKind[];
  experimentIds?: string[];
  /** モデルの自動実行ルールが始めたRunだけ（そのJobを人が再試行したものも含む）。 */
  automationOnly?: boolean;
}
export interface NotificationRule {
  id: string;
  projectId: string;
  channelId: string;
  eventTypes: NotificationEventType[];
  filter: NotificationRuleFilter;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}
export interface NotificationRuleCreate {
  channelId: string;
  eventTypes: NotificationEventType[];
  filter?: NotificationRuleFilter;
  enabled?: boolean;
}
/** 設定は作成後に変えられない。切り替えられるのはenabledだけ。 */
export interface NotificationRulePatch {
  enabled: boolean;
}

export interface NotificationRunSummary {
  id: string;
  name: string;
  kind: RunKind;
  status: RunStatus;
  experimentId: string;
  experimentName: string;
  /** Runのエラーを短くしたもの。実行のスナップショット、parameter、environmentは入れない。 */
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

/** webhookで配信する本文。Slackとメールのメッセージの元にもなる。 */
export interface NotificationEvent {
  schemaVersion: 1;
  id: string;
  type: NotificationEventType | 'notification.test';
  occurredAt: string;
  title: string;
  project: { id: string; name: string } | null;
  run: NotificationRunSummary | null;
  /** workerやJobのidのような、イベントごとのスカラー値。シークレットは入れない。 */
  details: Record<string, string | number | boolean | null>;
  /** イベントについての画面のページ。MMT_WEB_ORIGINから組み立てる。 */
  url: string | null;
}

export type NotificationDeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed';
export interface NotificationDelivery {
  id: string;
  ruleId: string;
  channelId: string;
  channelName: string;
  channelKind: NotificationChannelKind;
  eventId: string;
  eventType: NotificationEventType;
  title: string;
  runId: string | null;
  status: NotificationDeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  /** notification_http_500のような失敗のコード。相手の応答やURLは入れない。 */
  lastError: string | null;
  /** X-MMT-Deliveryとして送り、受け手が自分のログと突き合わせられるようにする。 */
  sentDeliveryId: string | null;
  createdAt: string;
  deliveredAt: string | null;
}
export interface NotificationTestResult {
  delivered: boolean;
  sentDeliveryId: string | null;
  error: string | null;
}
