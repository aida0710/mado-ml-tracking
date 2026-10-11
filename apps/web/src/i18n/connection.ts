import * as english from './en/connection';
import { localized } from './localized';
// The guide to recording from the Mado Python SDK and the MLflow 3 SDK, on the Project settings
// page and the Experiments page.
export const connectionText = localized({
  recordingConnection: 'SDK・MLflow 3から接続',
  recordingConnectionIssueToken: 'このProject用のAPI tokenを発行',
  recordingGuideToggle: 'SDKで記録',
  projectId: 'プロジェクトID',
  experimentId: '実験ID',
  recordingWithSdk: 'Python SDK（mado-tracking）',
  recordingWithMlflow: 'MLflow 3',
  recordingSdkInstall: 'インストール（Python 3.11以上）',
  recordingEnvironment: '環境変数（tokenは実行時に入力）',
  recordingPython: 'Pythonの例',
  recordingSdkExperimentByName:
    'start_runにexperiment_name="実験名"を渡すと、IDの代わりに名前で実験を選べます。その名前の実験が無ければ作ります。',
  recordingSdkNamedExperiment:
    'experiment_nameの実験が無ければ作ります。Experimentsで実験を選んで［SDKで記録］を開くと、その実験のIDを入れた例になります。',
  mlflowConnectionMore: 'Service Accountのtoken・Basic認証',
  mlflowConnectionServiceAccountHint:
    '長期の自動処理やworkerには、Service Accountのtokenを使ってください。SSOユーザーのtokenは、グループの確認から7日を過ぎると止まります。',
  mlflowConnectionBasic: 'Basic認証（ユーザー名とパスワードを使うツール。passwordにtoken）',
} as const, english.connectionText);
