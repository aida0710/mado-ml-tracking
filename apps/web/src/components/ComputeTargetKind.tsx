import type { ComputeTarget } from '@mmt/contracts';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { computeTargetExecutorLabels, submissionModeBadgeLabels } from '../i18n/compute';

/** The executor with the CPU, and for a site how it is submitted and whether it takes arrays. */
export function ComputeTargetKind({
  target,
}: {
  target: Pick<ComputeTarget, 'executor' | 'cpuArch' | 'submissionMode' | 'supportsArray'>;
}) {
  useLocale();
  return (
    <span className="badge-group">
      {computeTargetExecutorLabels[target.executor]}
      <span className="status-badge status-neutral">{target.cpuArch}</span>
      {target.executor === 'site' && (
        <span
          className={`status-badge ${target.submissionMode === 'manual' ? 'status-attention' : 'status-neutral'}`}
        >
          {submissionModeBadgeLabels[target.submissionMode]}
        </span>
      )}
      {target.executor === 'site' && target.supportsArray && (
        <span className="status-badge status-neutral">{text.supportsArrayBadge}</span>
      )}
    </span>
  );
}
