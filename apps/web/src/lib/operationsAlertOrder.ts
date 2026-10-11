import type { OperationsAlert } from '@mmt/contracts';

/**
 * The open Project's alerts first, then the other Projects', each group keeping the API's
 * newest-first order, so what concerns the screen in front of the user is on top.
 */
export function orderAlertsForProject(
  alerts: readonly OperationsAlert[],
  openProjectId: string | undefined,
): OperationsAlert[] {
  const isOpen = (alert: OperationsAlert) => alert.projectId === openProjectId;
  return [...alerts.filter(isOpen), ...alerts.filter((alert) => !isOpen(alert))];
}
