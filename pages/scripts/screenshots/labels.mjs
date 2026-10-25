// 撮影のスクリプトが探すアクセシブルな名前と表示の文字を、UIの言語ごとに置く。
// apps/web/src/i18n/*.ts（ja）とapps/web/src/i18n/en/*.ts（en）から写したもので、キーは
// その文字の出どころのカタログのキー。UIの文言を変えたら、ここも変える。
const JAPANESE = {
  // access.ts, admin.ts
  username: 'ユーザー名',
  userMenu: 'ユーザーメニュー',
  auditEvents: '監査ログ',
  // artifacts.ts
  audioSpectrogramScale: 'スペクトログラム',
  audioScaleMel: 'mel',
  // catalog.ts
  name: '名前',
  newProject: 'プロジェクトを作成',
  uploadArtifact: 'Artifactをアップロード',
  newVersion: 'バージョンを作成',
  automationRules: '自動実行ルール',
  automationHistory: '自動実行履歴',
  assignAlias: 'Aliasを設定',
  members: 'Members',
  newTarget: 'コンピュータを追加',
  host: 'Host',
  sshUsername: 'SSHユーザー',
  sshKeyPath: 'SSH鍵のパス',
  knownHostsPath: 'known_hostsのパス',
  workDirectory: '作業ディレクトリ',
  save: '保存',
  // comments.ts
  comments: 'コメント',
  // compute.ts: 確認結果の見出しは`${targetCheck}: ${computer name}`の形。
  targetCheck: '接続確認',
  // computerSetup.ts
  checkAndContinue: '接続を確認して次へ',
  checkReached: '接続を確認しました',
  // connection.ts
  recordingConnection: 'SDK・MLflow 3から接続',
  recordingConnectionIssueToken: 'このProject用のAPI tokenを発行',
  // media.ts: mediaCompareEvenly(count)は`均等に${count}列`。
  mediaCompareEvenly: /^均等に\d+列$/,
  // models.ts
  modelVersionLineage: '学習Run → バージョン → 推論・評価Run',
  evaluationResults: '評価結果',
  // notifications.ts
  notifications: '通知',
  // projects.ts
  projectDescriptionOptional: '説明（任意）',
  projectIncludeArchived: 'アーカイブ済みも表示',
  private: 'Private',
  public: 'Public',
  // promotion.ts
  promotionPolicies: '昇格policy',
  // runs.ts
  editChart: '図を設定',
  showCharts: '図を表示',
  chartTarget: '図にするRun',
  // serviceAccounts.ts
  serviceAccounts: 'Service Accounts',
  issueToken: 'API tokenを発行',
};

const ENGLISH = {
  username: 'Username',
  userMenu: 'User menu',
  auditEvents: 'Audit log',
  audioSpectrogramScale: 'Spectrogram',
  audioScaleMel: 'mel',
  name: 'Name',
  newProject: 'Create project',
  uploadArtifact: 'Upload artifact',
  newVersion: 'Create version',
  automationRules: 'Automation rules',
  automationHistory: 'Automation history',
  assignAlias: 'Assign alias',
  members: 'Members',
  newTarget: 'Add computer',
  host: 'Host',
  sshUsername: 'SSH user',
  sshKeyPath: 'SSH key path',
  knownHostsPath: 'known_hosts path',
  workDirectory: 'Working directory',
  save: 'Save',
  comments: 'Comments',
  targetCheck: 'Connection check',
  checkAndContinue: 'Check connection and continue',
  checkReached: 'Connection verified',
  recordingConnection: 'Connect from SDK or MLflow 3',
  recordingConnectionIssueToken: 'Issue API token for this project',
  // mediaCompareEvenly(count)は'1 column'か`${count} equal columns`。
  mediaCompareEvenly: /^(1 column|\d+ equal columns)$/,
  modelVersionLineage: 'Training run → Version → Inference / Evaluation runs',
  evaluationResults: 'Evaluation results',
  notifications: 'Notifications',
  projectDescriptionOptional: 'Description (optional)',
  projectIncludeArchived: 'Include archived projects',
  private: 'Private',
  public: 'Public',
  promotionPolicies: 'Promotion policies',
  editChart: 'Configure chart',
  showCharts: 'Show charts',
  chartTarget: 'Runs to chart',
  serviceAccounts: 'Service accounts',
  issueToken: 'Issue API token',
};

const LABELS = { ja: JAPANESE, en: ENGLISH };

export function labelsFor(lang) {
  return LABELS[lang];
}
