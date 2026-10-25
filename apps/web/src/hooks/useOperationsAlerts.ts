import { operationsApi } from '../api/operations';
import { useQuery } from './useQuery';

// The API monitor checks every 30 seconds; polling faster would only repeat the same answer.
export const OPERATIONS_ALERT_POLL_MS = 30_000;

/**
 * Open operations alerts of every Project the user may open, refreshed while the header is shown,
 * so a stopped worker of another Project is seen without opening that Project first.
 */
export function useOperationsAlerts() {
  return useQuery({ key: 'operations-alerts', load: operationsApi.openAlerts, pollMs: OPERATIONS_ALERT_POLL_MS });
}
