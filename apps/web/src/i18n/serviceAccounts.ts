import * as english from './en/serviceAccounts';
import { localized } from './localized';
import { TOKEN_PURPOSE_LABELS, type TokenScope } from '@mmt/contracts';
import type { TokenPurposeOption } from '../lib/tokenPurposes';

// Service Accounts, the Project token list and the token dialog on the settings page.
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
  legacyToken: '旧形式',
  legacyTokenHint:
    '個人が所有するservice tokenです。所有者がProjectを離れると止まるため、Service Accountのtokenへ置き換えてください。',
  tokenUsage: '設定例',
  tokenAuthentication: '認証方式',
  tokenAuthenticationBearer: 'Bearer（MLflow・Mado SDKの既定）',
  tokenAuthenticationBasic: 'Basic（ユーザー名とパスワードを使うツール。passwordにtoken）',
  tokenNameHint: 'どこで使うか分かる名前にします（例: laptop-notebook）。',
  tokenPurpose: '用途',
  tokenPurposeHint: '用途を選ぶと、必要なscopeが選ばれます。scopeを変えると「scopeを自分で選ぶ」になります。',
  tokenPurposeRequired: '用途を選ぶか、scopeを1つ以上選んでください',
  copyIssuedToken: 'tokenをコピー',
  copyTokenUsage: '設定例をコピー',
  tokenUsageEnvironment: '環境変数（Python SDKとMLflow 3の両方）',
  tokenUsageHint:
    '設定例にtokenは入っていません。端末に貼り付けて実行すると「API token:」と聞かれるので、［tokenをコピー］でコピーしたtokenを貼り付けます。画面には表示されず、shellの履歴にも残りません。',
} as const, english.serviceAccountsText);

// The purposes the token dialog offers, each with what the token can then do. The purposes' names
// are in contracts because the API names them too when a token lacks a scope.
export const tokenPurposeLabels: Record<TokenPurposeOption, { label: string; hint: string }> = localized({
  recording: {
    label: TOKEN_PURPOSE_LABELS.recording,
    hint: 'Runの記録、モデル・データセットの登録、Artifactの保存。使われていないデータセットのバージョンも削除でき、Project adminのtokenならArtifactも削除できます',
  },
  jobSubmission: {
    label: TOKEN_PURPOSE_LABELS.jobSubmission,
    hint: '手動投入のコンピュータで、待っているJobを取り出して投入する',
  },
  worker: {
    label: TOKEN_PURPOSE_LABELS.worker,
    hint: 'Jobを受け取って実行し、出力を保存する',
  },
  readOnly: { label: TOKEN_PURPOSE_LABELS.readOnly, hint: 'Runやモデルを読むだけ。記録はできません' },
  custom: { label: 'scopeを自分で選ぶ', hint: '下のscopeを1つずつ選びます' },
}, english.tokenPurposeLabels);

// One line per scope, shown next to the scope in the token dialog.
export const tokenScopeLabels: Record<TokenScope, string> = localized({
  read: 'read — 読み取り',
  'runs:write': 'runs:write — Runの作成と記録',
  'registry:write': 'registry:write — モデル・データセットの登録',
  'artifacts:write': 'artifacts:write — Artifactの保存',
  'jobs:write': 'jobs:write — Jobの起動と取り消し',
  'worker:execute': 'worker:execute — workerとしてJobを実行',
  admin: 'admin — Projectの管理',
}, english.tokenScopeLabels);

// Text that embeds values.
export const serviceAccountsTextTemplates = localized({
  tokenExpiryDays: (days: number) => `${days}日`,
  serviceAccountTokenTitle: (name: string) => `${name} のtokenを発行`,
  disableServiceAccountConfirm: (name: string) =>
    `「${name}」を無効化します。このService Accountのtokenはすべて、次の要求から使えなくなります。`,
}, english.serviceAccountsTextTemplates);
