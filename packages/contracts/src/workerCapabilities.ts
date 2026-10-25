/**
 * workerがclaimと再開のときにworkerInfo.capabilitiesで挙げる機能。それを必要とするJobは、
 * それを挙げたworkerにだけ渡す。古いworkerが、理解できない部分を黙って無視したまま実行する
 * ことがないようにするため。
 * - `workflowDatasetUsage`: ワークフローのstepに、データセットの使い方（MMT_DATASET_USAGE_FILE）
 *   と実行（MMT_WORKFLOW_EXECUTION_ID）を渡す。これが無いと、APIはstepが入力を使ったと記録する
 *   のに、stepはrole・重み・選択なしにすべての入力で学習してしまう。
 */
export const WORKER_CAPABILITIES = ['workflowDatasetUsage'] as const;
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];
