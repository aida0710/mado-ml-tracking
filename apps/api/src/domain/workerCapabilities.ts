import type { WorkerCapability } from '@mmt/contracts';

// ワークフローのステップのRunは、データセットの用途と実行内容をenvironmentに持つ。それを
// ステップのコードに渡すのは、このcapabilityを挙げたworkerだけ。
const WORKFLOW_STEP_CAPABILITY: WorkerCapability = 'workflowDatasetUsage';

/**
 * `run`という別名のrunsの行のJobを受けるために、workerが挙げていなければならないcapability
 * （text[]）を求めるSQL。siteに入れるrunnerについては、launcherや`mado-tracking submit`が
 * 挙げていなければならない。claimとJobの一覧で共有するので、一覧でJobが待つ理由が分かる。
 */
export function requiredWorkerCapabilitiesSql(run: string): string {
  return `(CASE WHEN ${run}.environment ? 'workflow' THEN ARRAY['${WORKFLOW_STEP_CAPABILITY}']
    ELSE ARRAY[]::text[] END)`;
}
