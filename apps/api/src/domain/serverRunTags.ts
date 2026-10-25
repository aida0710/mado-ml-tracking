// arrayとフックが作るRunに付ける予約のRun tag（mmt.*はサーバーだけが付ける）。
// 再試行はRunのtagを写すので、再試行のRunにも残る。

export const ARRAY_GROUP_TAG = 'mmt.arrayGroupId';
export const ARRAY_INDEX_TAG = 'mmt.arrayIndex';
export const HOOK_TAG = 'mmt.hookId';
export const HOOK_EXECUTION_TAG = 'mmt.hookExecutionId';
// checkpoint_savedのフックがJobに渡すcheckpoint（WorkerJob.inputCheckpoint）。
export const INPUT_CHECKPOINT_TAG = 'mmt.inputCheckpointId';
