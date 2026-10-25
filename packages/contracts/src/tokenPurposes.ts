import type { TokenScope } from './serviceAccounts.js';

/**
 * API tokenを発行する目的。tokenのダイアログが並べる順（よく使うものが先）。それぞれがその用途に
 * 必要なscopeを表し（pages/admin/tokens.md）、scopeの名前を思い出す代わりに、何をするかで
 * 選べるようにする。
 */
export const TOKEN_PURPOSES = ['recording', 'jobSubmission', 'worker', 'readOnly'] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export const TOKEN_PURPOSE_SCOPES: Record<TokenPurpose, readonly TokenScope[]> = {
  // どちらのSDKも、書き込む前に実験やModelを調べる。runs:writeはreadを含まない。
  recording: ['read', 'runs:write', 'registry:write', 'artifacts:write'],
  // `mado-tracking submit`は自分の待つJobをclaimし（jobs:write）、待っている数を出す（read）。
  jobSubmission: ['read', 'jobs:write'],
  // workerはJobをclaimし、その出力を保存する。
  worker: ['read', 'worker:execute', 'artifacts:write'],
  readOnly: ['read'],
};

/**
 * 各用途の英語の名前。API は token の scope が足りないとき、発行の画面のこの選択肢を名指しする。
 * 画面の日本語の名前は apps/web/src/i18n/serviceAccounts.ts にある。
 */
export const TOKEN_PURPOSE_LABELS: Record<TokenPurpose, string> = {
  recording: 'Record from SDK or MLflow 3',
  jobSubmission: 'Submit jobs from the command line',
  worker: 'Run jobs as a worker',
  readOnly: 'Read only',
};
