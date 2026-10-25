import * as english from './en/serviceAccounts';
import { localized } from './localized';
import type { TokenScope } from '@mmt/contracts';
import type { TokenPurposeOption } from '../lib/tokenPurposes';

// 設定の画面のService Account、Projectのtokenの一覧、tokenのダイアログ。
export const serviceAccountsText = localized({
  serviceAccounts: 'Service Accounts',
  serviceAccountsDescription:
    '人に紐付かないアカウントです。workerや自動実行のtokenをここで発行すると、発行した人がProjectを離れても動き続けます。',
  serviceAccountsEmpty: 'Service Accountはまだありません',
  newServiceAccount: 'Service Accountを作成',
  editServiceAccount: 'Service Accountを編集',
  serviceAccountActive: '有効',
  serviceAccountDisabled: '無効',
  serviceAccountRoleMissing: 'Roleなし',
  serviceAccountRoleHint:
    'workerとしてJobを実行させるならAdmin（worker:executeにはAdminが要ります）、SDKやCIからRunを記録するならEditor、読むだけならViewerにします。',
  disableServiceAccount: '無効化',
  enableServiceAccount: '有効化',
  issueToken: 'API tokenを発行',
  personalTokens: '自分のAPI token',
  projectTokens: 'Projectのtoken一覧',
  projectTokensDescription:
    'このProjectに限定された、全員とService Accountのtokenです。tokenの値は表示されません。',
  projectTokensEmpty: 'このProjectのtokenはありません',
  ownerTransfer: 'Service Accountへ移す',
  ownerTransferTarget: '移管先のService Account',
  ownerTransferred: '所有者を移しました。',
  tokenOwner: '所有者',
  tokenOwnerUser: 'ユーザー',
  tokenOwnerServiceAccount: 'Service Account',
  tokenPrefix: '先頭',
  tokenUsage: '設定例',
  tokenAuthentication: '認証方式',
  tokenAuthenticationBearer: 'Bearer（MLflow・Mado SDKの既定）',
  tokenAuthenticationBasic: 'Basic（ユーザー名とパスワードを使うツール。passwordにtoken）',
  tokenNameHint: 'どこで使うか分かる名前にします（例: laptop-notebook）。',
  tokenPurpose: '用途',
  tokenPurposeHint: '用途を選ぶと、必要なscopeが選ばれます。scopeを変えると「scopeを自分で選ぶ」になります。',
  tokenPurposeRequired: '用途を選ぶか、scopeを1つ以上選んでください',
  tokenExpiryCustom: '期間を指定',
  tokenExpiryCalendar: 'カレンダーで指定',
  tokenExpiryDateTime: '有効期限の日時',
  tokenExpiryDateInvalid: '有効期限は未来の日時を指定してください',
  tokenExpiryDuration: '有効期間',
  tokenExpiryUnit: '単位',
  tokenExpiryMinutes: '分',
  tokenExpiryHours: '時間',
  tokenExpiryDays: '日',
  tokenExpiryInvalid: '有効期間は0より大きい数値で指定してください',
  copyIssuedToken: 'tokenをコピー',
  copyTokenUsage: '設定例をコピー',
  tokenUsageEnvironment: '環境変数（Python SDKとMLflow 3の両方）',
  tokenUsageHint:
    '設定例にtokenは入っていません。端末に貼り付けて実行すると「API token:」と聞かれるので、［tokenをコピー］でコピーしたtokenを貼り付けます。画面には表示されず、shellの履歴にも残りません。',
} as const, english.serviceAccountsText);

// 発行の画面の用途と、その token でできること。英語の名前は API も使うので contracts にある。
export const tokenPurposeLabels: Record<TokenPurposeOption, { label: string; hint: string }> = localized({
  recording: {
    label: 'SDK・MLflow 3から記録する',
    hint: 'Runの記録、モデル・データセットの登録、Artifactの保存。使われていないデータセットのバージョンも削除でき、Project adminのtokenならArtifactも削除できます',
  },
  jobSubmission: {
    label: 'コマンドからJobを投入する',
    hint: '手動投入のコンピュータで、待っているJobを取り出して投入する',
  },
  worker: {
    label: 'workerとしてJobを実行する',
    hint: 'Jobを受け取って実行し、出力を保存する',
  },
  readOnly: { label: '読み取りだけ', hint: 'Runやモデルを読むだけ。記録はできません' },
  custom: { label: 'scopeを自分で選ぶ', hint: '下のscopeを1つずつ選びます' },
}, english.tokenPurposeLabels);

// scopeごとに1行。tokenのダイアログでscopeの隣に出す。
export const tokenScopeLabels: Record<TokenScope, string> = localized({
  read: 'read — 読み取り',
  'runs:write': 'runs:write — Runの作成と記録',
  'registry:write': 'registry:write — モデル・データセットの登録',
  'artifacts:write': 'artifacts:write — Artifactの保存',
  'jobs:write': 'jobs:write — Jobの起動と取り消し',
  'worker:execute': 'worker:execute — workerとしてJobを実行',
  admin: 'admin — Projectの管理',
  'tokens:manage': 'tokens:manage — このtokenの範囲内でtokenとService Accountを管理',
  'audit:read': 'audit:read — 全体の監査ログを読む',
  'users:manage': 'users:manage — ユーザーを管理',
}, english.tokenScopeLabels);

// 値を埋め込む文言。
export const serviceAccountsTextTemplates = localized({
  tokenExpiryDays: (days: number) => `${days}日`,
  tokenExpiryTimezone: (timezone: string) => `時刻は${timezone}で指定します。`,
  serviceAccountTokenTitle: (name: string) => `${name} のtokenを発行`,
  disableServiceAccountConfirm: (name: string) =>
    `「${name}」を無効化します。このService Accountのtokenはすべて、次の要求から使えなくなります。`,
}, english.serviceAccountsTextTemplates);
