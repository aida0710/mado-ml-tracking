import * as english from './en/automation';
import { localized } from './localized';
import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';
import type { AutomationSkipReason } from '../lib/automationSkipReason';
import { text } from './catalog';

export const automationOutcomeLabels: Record<ModelAutomationExecution['status'], string> = localized({
  pending: '学習完了待ち',
  get queued() { return text.automationQueued; },
  get failed() { return text.automationFailed; },
  get skipped() { return text.automationSkipped; },
}, english.automationOutcomeLabels);

export const automationSkipReasonLabels: Record<AutomationSkipReason, string> = localized({
  source_run_unsuccessful: '起動せず（学習Runが失敗・停止）',
  source_run_timeout: '起動せず（学習完了待ちの期限切れ）',
  upstream_unsuccessful: '起動せず（上流のRunが失敗・停止）',
  upstream_outputs_missing: '起動せず（上流のRunに出力データセットなし）',
}, english.automationSkipReasonLabels);

export const automationTriggerLabels: Record<ModelAutomationRule['trigger'], string> = localized({
  model_registered: 'モデル登録',
  upstream_run_finished: '上流ruleの成功',
}, english.automationTriggerLabels);

export const automationText = localized({
  sourceRun: '学習Runを開く',
  triggerRun: '上流のRunを開く',
  pendingHint: '学習Runが成功すると、その時点で有効なルールで起動します。',
  trigger: 'トリガー',
  upstreamRule: '上流rule',
  stage: '段',
  stageLabel: (stage: number) => `${stage}段目`,
  manual: '手動',
  attemptLabel: (attempt: number) => `${attempt}回目`,
  triggerError: 'トリガーを選択してください。',
  upstreamRequired: '上流ruleを選択してください。',
  upstreamInvalid: '同じプロジェクトの有効な別のruleを上流に選択してください。',
  reservedTag: (key: string) =>
    `tag「${key}」は使えません。automation. と mmt. で始まるtagはサーバーが付けます。`,
  applyToVersion: '既存のバージョンに適用',
  applyVersion: '適用するバージョン',
  applyUpstreamRun: '上流のRun',
  applyConfirm: '適用する',
  applyConfirmMessage: (ruleName: string, targetLabel: string) =>
    `「${ruleName}」を ${targetLabel} に適用し、Jobを登録します。`,
  applyNoVersions: '対象モデル系列のバージョンがありません。',
  applyNoUpstreamRuns: '上流ruleが作ったRunがありません。',
  applied: 'Jobを登録しました。自動実行履歴で状態を確認できます。',
  automaticRun: '自動',
  maxAttempts: '最大実行回数（2以上で失敗時に自動で再実行）',
  retryOf: (attempt: number) => `${attempt}回目の失敗を自動で再実行`,
  rerun: '再実行',
  rerunConfirmMessage: (ruleName: string) =>
    `「${ruleName}」を同じバージョンにもう一度適用し、新しいJobを登録します。`,
  rerunDone: '再実行を登録しました。',
  owner: '所有者',
  ownerHuman: (name: string) => `${name}（人）`,
  ownerServiceAccount: (name: string) => `${name}（Service Account）`,
  ownerHint: '自動実行はこの所有者の権限で起動し、作るRunの作成者になります。',
  transferConfirmMessage: (ruleName: string, accountName: string) =>
    `「${ruleName}」の所有者を ${accountName} に移します。以後の自動実行はこのService Accountの権限で起動します。`,
  copiedRuleName: (name: string) => `${name}（複製）`,
  copyRule: '複製して新しく作る',
  copyRuleTitle: (name: string) => `「${name}」を複製して作成`,
  copyRuleHint:
    '作成済みのルールは変更できないため、直すときは設定を引き継いだ新しいルールを作ります。',
  disableSourceRule: (name: string) => `作成したら「${name}」を無効にする`,
  disableSourceRuleHint:
    '両方が有効のままだと、同じバージョンに両方のルールがJobを登録します。',
  // 複製は作成できたが、そのあと元のルールを無効にするのに失敗したとき。
  sourceRuleLeftEnabled: (rules: { copyName: string; sourceName: string }) =>
    `「${rules.copyName}」は作成しましたが、元の「${rules.sourceName}」を無効にできませんでした。今は両方が有効で、同じバージョンに両方のルールがJobを登録します。一覧で「${rules.sourceName}」の［無効にする］を押してください。`,
  downstreamFollowsSource: (names: readonly string[]) =>
    `「${names.join('」「')}」は［上流rule］に元のルールを選んでいます。元のルールを無効にすると動かなくなるため、新しいルールを上流にするには、それらも同じ操作で作り直してください。`,
  downstreamRules: 'このルールの後に動くルール',
  noDownstreamRules: 'なし',
  showRuleHistory: 'このルールの実行履歴を見る',
  disabledRuleCannotApply:
    'このルールは無効です。有効にすると、既存のバージョンに適用できます。',
  enableRule: '有効にする',
  runAndJobStatus: 'Run・Jobの状態',
  runLabel: 'Run',
  jobLabel: 'Job',
  manageAdminOnly: '自動実行ルールの作成・変更・適用は、Project adminと全体管理者が行います。',
  historyAllRules: 'すべてのルール',
  historyAllVersions: 'すべてのバージョン',
  historyLoadMore: 'さらに表示',
  historyShownCount: (count: number) => `新しい順に${count}件を表示しています。`,
  transferNoAccounts:
    'ほかに移管できるService Accountがありません。移管先はプロジェクト設定でrole adminの有効なService Accountとして作成します。',
}, english.automationText);
