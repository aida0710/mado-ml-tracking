import type { OperationsAlert } from '@mmt/contracts';

/**
 * 開いているProjectのアラートを先に、ほかのProjectのアラートを後に並べる。どちらもAPIの新しい順を
 * 保つ。利用者が見ている画面に関わるものを上に出すため。
 */
export function orderAlertsForProject(
  alerts: readonly OperationsAlert[],
  openProjectId: string | undefined,
): OperationsAlert[] {
  const isOpen = (alert: OperationsAlert) => alert.projectId === openProjectId;
  return [...alerts.filter(isOpen), ...alerts.filter((alert) => !isOpen(alert))];
}
