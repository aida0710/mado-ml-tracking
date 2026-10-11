import type {
  ComputeTarget,
  ComputeTargetDetails,
  TargetCheckHost,
  TargetCheckItemName,
} from '@mmt/contracts';
import { text, textTemplates } from '../i18n/catalog';
import { formatBytes } from './format';
import {
  computeTargetExecutorLabels,
  submissionModeBadgeLabels,
  targetCheckItemLabels,
} from '../i18n/compute';

// Shown where a computer has nothing to tell (no connection, no facts from its check).
const NO_VALUE = '—';

/**
 * Where a target runs Jobs, for the Compute table. A local target runs on the worker's own host,
 * so its stored host and port (127.0.0.1:22 from the form defaults) are not shown as SSH. A site is
 * reached at its settings' connection, which only its owner and global administrators see; a
 * manual site has none, since each requester submits on it themselves.
 */
export function formatTargetLocation(
  target: Pick<ComputeTargetDetails, 'executor' | 'host' | 'port' | 'username' | 'site'>,
): string {
  if (target.executor === 'local') return text.targetLocationLocal;
  if (target.executor === 'site') {
    const connection = target.site?.connection;
    if (!connection) return NO_VALUE;
    const account = target.site?.accountMode === 'shared' ? `${target.site.sharedAccount}@` : '';
    return `${account}${connection.host}:${connection.port}`;
  }
  return target.host ? `${target.username}@${target.host}:${target.port}` : NO_VALUE;
}

/** A target in a select: the name and where it runs. */
export function targetChoiceLabel(
  target: Pick<ComputeTarget, 'name' | 'executor' | 'host' | 'submissionMode'>,
): string {
  // A local target runs on the worker's host and may have no host of its own.
  if (target.executor === 'local') return `${target.name} · ${text.targetLocationLocal}`;
  // The host is hidden from those who may not manage the computer; then the name stands alone.
  if (target.executor !== 'site') return target.host ? `${target.name} · ${target.host}` : target.name;
  const mode = submissionModeBadgeLabels[target.submissionMode];
  return `${target.name} · ${computeTargetExecutorLabels.site}（${mode}）`;
}

/** The GPUs a target offers: its GPU IDs, or for a site the count each Job asks for. */
export function formatTargetGpus(target: Pick<ComputeTarget, 'executor' | 'gpuIds'>): string {
  if (target.executor === 'site') return text.targetGpuPerJob;
  return target.gpuIds.join(', ') || text.cpuOnly;
}

/**
 * How the worker reaches an ssh or local target, as written above the connection check results.
 * Sites are checked by their launcher instead (SiteConnectionChecks).
 */
export function targetCheckHintFor(executor: ComputeTarget['executor']): string {
  return executor === 'local' ? text.targetCheckHintLocal : text.targetCheckHint;
}

/** The first check item is the SSH connection, or starting a command for a local target. */
export function targetCheckItemLabel(
  name: TargetCheckItemName,
  executor: ComputeTarget['executor'],
): string {
  if (name === 'connection' && executor === 'local') return text.targetCheckLocalConnection;
  return targetCheckItemLabels[name];
}

/** The machine a check reached in one line: `uname -m`, cores and memory, as far as it told. */
export function formatCheckedHost(host: TargetCheckHost): string {
  const facts = [
    host.machine,
    host.cpuCount === null ? null : textTemplates.cpuCount(host.cpuCount),
    host.memoryTotalBytes === null ? null : formatBytes(host.memoryTotalBytes),
  ].filter((fact) => fact !== null);
  return facts.length ? textTemplates.hostFactsSummary(facts) : NO_VALUE;
}
