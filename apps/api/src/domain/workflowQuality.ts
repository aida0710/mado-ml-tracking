import type { LatestMetricValue, WorkflowQualityGate } from '@mmt/contracts';

export function workflowQualityFailure(
  gates: WorkflowQualityGate[],
  metrics: Record<string, number>,
): string | null {
  for (const gate of gates) {
    const value = metrics[gate.metric];
    if (value === undefined || !Number.isFinite(value))
      return `品質値が記録されていません: ${gate.metric}`;
    const passed =
      gate.operator === 'gte'
        ? value >= gate.threshold
        : gate.operator === 'lte'
          ? value <= gate.threshold
          : value === gate.threshold;
    if (!passed)
      return `品質条件を満たしていません: ${gate.metric} (${value} ${gate.operator} ${gate.threshold})`;
  }
  return null;
}

export function finiteWorkflowMetrics(
  metrics: Record<string, LatestMetricValue>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}
