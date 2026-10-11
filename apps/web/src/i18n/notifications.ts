import * as english from './en/notifications';
import { localized } from './localized';
import type {
  NotificationChannelKind,
  NotificationDeliveryStatus,
  NotificationEventType,
} from '@mmt/contracts';

// Notification channels, rules and the delivery history in the Project settings.
export const notificationsText = localized({
  notifications: '通知',
  notificationsDescription:
    'Runの失敗などをSlack、Webhook、メールへ通知します。通知先は全体管理者が登録し、どのイベントを送るかはProject adminがルールで決めます。',
  notificationChannels: '通知先',
  newNotificationChannel: '通知先を追加',
  editNotificationChannel: '通知先を変更',
  notificationChannelsEmpty: '使える通知先はまだありません',
  notificationChannelKind: '種類',
  notificationChannelScope: '使えるProject',
  notificationScopeGlobal: 'すべてのProject',
  notificationScopeProject: 'このProjectだけ',
  notificationDestination: '送信先',
  notificationConfigured: '送信設定',
  notificationConfiguredYes: '設定済み',
  notificationConfiguredNo: '未設定（API serverに変数が無い）',
  notificationSmtpUnconfigured: '未設定（SMTPの送信設定が無い）',
  notificationUrlEnv: 'URLを参照する環境変数名（MMT_NOTIFICATION_で始まる）',
  notificationSecretEnv: '署名の鍵を参照する環境変数名（MMT_NOTIFICATION_で始まる）',
  notificationRecipients: '宛先のメールアドレス（1行に1件）',
  notificationChannelHint:
    'URLと署名の鍵はAPI serverの環境変数に置き、ここには変数名だけを登録します。値は画面にもDBにも保存しません。',
  notificationEmailHint:
    'メールはAPI serverにSMTPの送信設定（MMT_SMTP_URL、MMT_SMTP_FROM）があるときだけ送ります。設定が無くても通知先は作成できますが、送信は失敗として送信履歴に残ります。',
  notificationChannelsAdminOnly:
    '通知先の追加と変更は全体管理者が行います。送りたい先（Slackなど）があるときは、全体管理者に通知先の追加を依頼してください。',
  notificationEnvNameHint:
    'API serverの環境変数のうち、MMT_NOTIFICATION_で始まり値が入っているものを候補に出します（値は表示しません）。',
  notificationEnvNameNoCandidates:
    'API serverにMMT_NOTIFICATION_で始まる環境変数がありません。API serverの.envに追加し、API serverを再起動してください。',
  notificationRuleNeedsChannelAdmin:
    '通知ルールを作るには、先に上の［通知先を追加］で通知先を作成してください。',
  notificationRuleNeedsChannel:
    '通知ルールを作るには通知先が必要です。全体管理者に通知先の追加を依頼してください。',
  notificationRuleChannelUnconfigured:
    'この通知先はAPI serverに送信設定が無いため、ルールを作成しても届きません。送信設定は全体管理者が行います。',
  notificationTest: 'テスト送信',
  notificationTestDelivered: 'テスト送信が届きました',
  notificationTestFailed: 'テスト送信に失敗しました',
  notificationTestNotInHistory:
    'テスト送信は送信履歴には残りません。結果は監査ログ（通知先のテスト送信）に残ります。',
  notificationEnvNameInvalid:
    '環境変数名はMMT_NOTIFICATION_で始め、英大文字・数字・_だけで書いてください',
  notificationRules: '通知ルール',
  newNotificationRule: '通知ルールを作成',
  notificationRulesEmpty: '通知ルールはまだありません',
  notificationRuleChannel: '通知先',
  notificationRuleEvents: '通知するイベント',
  notificationRuleFilter: '条件',
  notificationRuleFilterNone: 'すべて',
  notificationRuleRunKinds: 'Runの実行種別（未選択ならすべて）',
  notificationRuleExperiments: '実験（未選択ならすべて）',
  notificationRuleAutomationOnly: '自動実行が起動したRunだけ',
  notificationRuleFixedSettings:
    '作成後は有効・無効のみ変更できます。条件を変える場合は新しいルールを作成してください。',
  notificationRuleChannelRequired: '通知先を選択してください',
  notificationRuleEventsRequired: '通知するイベントを1つ以上選択してください',
  notificationEnable: '有効にする',
  notificationDisable: '無効にする',
  notificationDeliveries: '直近の送信履歴',
  notificationDeliveriesEmpty: '送信履歴はまだありません',
  notificationDeliveryEvent: 'イベント',
  notificationDeliveryAttempts: '試行回数',
  notificationDeliveryError: '失敗の理由',
  notificationDeliveryCreatedAt: '発生日時',
} as const, english.notificationsText);

export const notificationChannelKindLabels: Record<NotificationChannelKind, string> = localized({
  slack_webhook: 'Slack（Incoming Webhook）',
  webhook: 'Webhook（署名付き）',
  email: 'メール',
}, english.notificationChannelKindLabels);

export const notificationEventTypeLabels: Record<NotificationEventType, string> = localized({
  'run.failed': 'Runの失敗',
  'run.canceled': 'Runの中止',
  'run.finished': 'Runの完了',
  'automation.failed': '自動実行の失敗',
  'job.heartbeat_stale': 'Jobのheartbeat途絶',
  'job.heartbeat_recovered': 'Jobのheartbeat復旧',
  'worker.offline': 'workerの停止',
  'plugin.delivery_stalled': 'Plugin送信の滞留',
}, english.notificationEventTypeLabels);

export const notificationDeliveryStatusLabels: Record<NotificationDeliveryStatus, string> = localized({
  pending: '送信待ち',
  sending: '送信中',
  delivered: '送信済み',
  failed: '失敗',
}, english.notificationDeliveryStatusLabels);

// Failure codes stored by the API (packages/platform notification senders and the dispatcher).
export const notificationErrorLabels: Record<string, string> = localized({
  notification_channel_unconfigured:
    'API serverに、通知先が参照する環境変数（URLまたは署名の鍵）が設定されていません',
  notification_channel_disabled: '通知先が無効になっています',
  notification_rule_disabled: '通知ルールが無効になっています',
  notification_url_invalid: '環境変数のURLが不正です（認証情報を含まないhttp://またはhttps://のURLにしてください）',
  notification_destination_unavailable: '送信先に接続できませんでした',
  notification_timeout: '送信先の応答が時間内にありませんでした',
  notification_redirect_refused: '送信先がリダイレクトを返したため送信しませんでした',
  notification_recipients_invalid: '宛先のメールアドレスが不正です',
  notification_smtp_auth_failed: 'SMTPサーバーの認証に失敗しました',
  notification_smtp_tls_failed: 'SMTPサーバーとのTLS接続に失敗しました',
  notification_smtp_recipients_rejected: 'SMTPサーバーが宛先を受け付けませんでした',
  notification_delivery_failed: '送信中に予期しないエラーが発生しました',
  notification_dispatch_failed: '送信中に予期しないエラーが発生しました',
  sender_unavailable: 'API serverにこの種類の送信設定がありません',
}, english.notificationErrorLabels);

export const notificationsTextTemplates = localized({
  notificationEnvironmentMissing: (names: string) =>
    `API serverに ${names} がありません。このままでも保存できますが、送信はできません。API serverの.envに設定し、API serverを再起動してください。`,
  notificationChannelSavedUnconfigured: (name: string) =>
    `通知先「${name}」を保存しました。API serverに送信設定が無いため、まだ送信できません。API serverの.envに環境変数を設定し、API serverを再起動してください。`,
  notificationChannelChoice: (name: string, kind: string) => `${name}（${kind}）`,
  notificationChannelChoiceUnconfigured: (name: string, kind: string) =>
    `${name}（${kind}・未設定）`,
  notificationRuleFilterRunKinds: (kinds: string) => `実行種別: ${kinds}`,
  notificationRuleFilterExperiments: (count: number) => `実験: ${count}件`,
  notificationTestError: (reason: string) => `テスト送信に失敗しました: ${reason}`,
  notificationErrorHttp: (status: string) => `送信先がHTTP ${status}を返しました`,
  notificationErrorSmtp: (reply: string) => `SMTPサーバーが${reply}を返しました`,
  notificationErrorUnknown: (code: string) => `送信に失敗しました（${code}）`,
}, english.notificationsTextTemplates);
