import type { Hook, HookExecution, HookFilter } from '@mmt/contracts';
import { hookWebhookPath } from '@mmt/contracts';
import { clientApiUrl } from './clientApiUrl';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { formatClockDuration } from './clockDuration';
import { jobGpuSummary } from './jobDisplay';
import { text } from '../i18n/catalog';
import {
  hookExecutionStatusLabels,
  hookSkipReasonLabels,
  hooksTextTemplates,
} from '../i18n/hooks';
import { jobsTextTemplates } from '../i18n/jobs';
import { formatList } from '../i18n/textJoining';

export { hookWebhookPath };

/** 送信元がwebhookを送るアドレス。このページのアドレス（/apiを転送する）にpathを付けたもの。 */
export function hookWebhookUrl(hookId: string, origin: string): string {
  return `${clientApiUrl(origin)}${hookWebhookPath(hookId)}`;
}

/** 1回の起動の結果。待機中、失敗、Run待ち、または理由付きの見送り。 */
export function hookExecutionOutcome(execution: Pick<HookExecution, 'status' | 'reason'>): string {
  if (execution.status === 'skipped' && execution.reason)
    return hooksTextTemplates.hookSkipped(hookSkipReasonLabels[execution.reason]);
  return hookExecutionStatusLabels[execution.status];
}


/** フックの絞り込みを、見出しと値の組にしたもの。名前が分かるものはidの代わりに名前を出す。 */
export function hookFilterEntries(
  filter: HookFilter,
  catalog: Pick<ExecutionCatalog, 'experiments'> | undefined,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (filter.modelFamilies?.length)
    entries.push([text.hookFilterModelFamilies, formatList(filter.modelFamilies)]);
  if (filter.experimentIds?.length)
    entries.push([
      text.hookFilterExperiments,
      formatList(
        filter.experimentIds.map((id) => catalog?.experiments.find((experiment) => experiment.id === id)?.name ?? id),
      ),
    ]);
  if (filter.runKinds?.length)
    entries.push([text.hookFilterRunKinds, formatList(filter.runKinds.map((kind) => text[kind]))]);
  if (filter.runStatuses?.length)
    entries.push([
      text.hookFilterRunStatuses,
      formatList(filter.runStatuses.map((status) => text[status])),
    ]);
  if (filter.tags && Object.keys(filter.tags).length)
    entries.push([text.hookFilterTags, JSON.stringify(filter.tags)]);
  return entries;
}

/** フックのJobが求める資源。GPU ID、またはsiteならGPUの数、制限時間、array。 */
export function hookResourceSummary(template: Hook['template'], isSite: boolean): string {
  if (!isSite) return jobGpuSummary(template);
  const parts = [
    jobGpuSummary({ gpuIds: [], gpuCount: template.gpuCount }),
    `${text.walltimeShort} ${formatClockDuration(template.walltimeSeconds) || text.walltimeUnset}`,
  ];
  if (template.arraySize !== null) parts.push(jobsTextTemplates.arraySize(template.arraySize));
  return parts.join(' · ');
}
