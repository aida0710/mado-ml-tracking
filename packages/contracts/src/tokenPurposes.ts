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
 * What the token dialog calls each purpose. The API names the same choice when a token lacks a
 * scope, so the person finds it on the screen.
 */
export const TOKEN_PURPOSE_LABELS: Record<TokenPurpose, string> = {
  recording: 'SDK・MLflow 3から記録する',
  jobSubmission: 'コマンドからJobを投入する',
  worker: 'workerとしてJobを実行する',
  readOnly: '読み取りだけ',
};
