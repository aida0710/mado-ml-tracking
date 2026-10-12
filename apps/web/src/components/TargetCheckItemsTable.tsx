import type { ComputeTarget, TargetCheckItem } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { targetCheckItemLabel } from '../lib/computeTargetDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { targetCheckCodeHints, targetCheckOutcomeLabels } from '../i18n/compute';

// Reuses the Job status colors: ok is green, ng red, the rest neutral.
const outcomeBadgeClass: Record<TargetCheckItem['status'], string> = {
  ok: 'status-finished',
  ng: 'status-failed',
  unavailable: 'status-queued',
  skipped: 'status-queued',
};

/** The items of a connection check: what passed, what failed and how to fix it. */
export function TargetCheckItemsTable({
  items,
  executor,
}: {
  items: TargetCheckItem[];
  executor: ComputeTarget['executor'];
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={items}
      rowKey={(item) => item.name}
      columns={[
        {
          key: 'item',
          priority: 'primary',
          header: text.targetCheckItem,
          render: (item) => targetCheckItemLabel(item.name, executor),
        },
        {
          key: 'outcome',
          priority: 'primary',
          header: text.targetCheckOutcome,
          render: (item) => (
            <span className={`status-badge ${outcomeBadgeClass[item.status]}`}>
              {targetCheckOutcomeLabels[item.status]}
            </span>
          ),
        },
        {
          key: 'detail',
          priority: 'secondary',
          header: text.targetCheckDetail,
          className: 'mono',
          render: (item) => item.detail ?? '—',
        },
        {
          key: 'action',
          priority: 'secondary',
          header: text.targetCheckAction,
          render: (item) => (item.code ? targetCheckCodeHints[item.code] : ''),
        },
      ]}
    />
  );
}
