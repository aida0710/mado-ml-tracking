import type { TokenScope } from './serviceAccounts.js';

/**
 * What an API token is issued for, in the order the token dialog lists them (the most common use
 * first). Each stands for the scopes that use needs (pages/admin/tokens.md), so people choose what
 * they will do instead of recalling scope names.
 */
export const TOKEN_PURPOSES = ['recording', 'jobSubmission', 'worker', 'readOnly'] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export const TOKEN_PURPOSE_SCOPES: Record<TokenPurpose, readonly TokenScope[]> = {
  // Both SDKs look an Experiment or a Model up before they write; runs:write does not imply read.
  recording: ['read', 'runs:write', 'registry:write', 'artifacts:write'],
  // `mado-tracking submit` claims one's waiting Jobs (jobs:write) and shows how many wait (read).
  jobSubmission: ['read', 'jobs:write'],
  // A worker claims Jobs and stores their outputs.
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
