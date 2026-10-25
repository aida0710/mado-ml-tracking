import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';

// APIはチェーンをMAX_AUTOMATION_CHAIN_DEPTH=5段までに抑える。Webはそれより少し後で止め、ルールの
// 一覧が古い場合や循環ができてしまった場合も、回り続けずに終わるようにする。
const MAX_DISPLAYED_STAGE = 10;

export interface AutomationPipelineRow {
  execution: ModelAutomationExecution;
  // モデルの登録に反応するルールが1で、上流のルールを1段たどるごとに+1。
  stage: number;
  isPipelineStart: boolean;
}

/** 上流をたどる段数を数えるので、前の行が一覧から外れても段の位置は変わらない。 */
export function automationRuleStage(
  ruleId: string,
  rulesById: ReadonlyMap<string, Pick<ModelAutomationRule, 'upstreamRuleId'>>,
): number {
  let stage = 1;
  let upstreamRuleId = rulesById.get(ruleId)?.upstreamRuleId ?? null;
  while (upstreamRuleId && stage < MAX_DISPLAYED_STAGE) {
    stage += 1;
    upstreamRuleId = rulesById.get(upstreamRuleId)?.upstreamRuleId ?? null;
  }
  return stage;
}

function pipelineKey(execution: ModelAutomationExecution): string {
  return execution.pipelineRootExecutionId ?? execution.id;
}

/**
 * 各パイプラインが上から下へ読めるように実行を並べる。最新の動きがあったパイプラインを先にし、
 * 1つのパイプラインの中は段の順、次に作成時刻の順にする（再試行が元の実行の後ろに続くように）。
 */
export function groupAutomationPipelines(
  executions: ModelAutomationExecution[],
  rules: Pick<ModelAutomationRule, 'id' | 'upstreamRuleId'>[],
): AutomationPipelineRow[] {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const pipelines = new Map<string, ModelAutomationExecution[]>();
  for (const execution of executions) {
    const key = pipelineKey(execution);
    pipelines.set(key, [...(pipelines.get(key) ?? []), execution]);
  }
  const latestCreatedAt = (members: ModelAutomationExecution[]) =>
    members.reduce((latest, item) => (item.createdAt > latest ? item.createdAt : latest), '');
  return [...pipelines.values()]
    .sort((left, right) => latestCreatedAt(right).localeCompare(latestCreatedAt(left)))
    .flatMap((members) =>
      members
        .map((execution) => ({
          execution,
          stage: automationRuleStage(execution.ruleId, rulesById),
        }))
        .sort(
          (left, right) =>
            left.stage - right.stage ||
            left.execution.createdAt.localeCompare(right.execution.createdAt),
        )
        .map((row, index) => ({ ...row, isPipelineStart: index === 0 })),
    );
}
