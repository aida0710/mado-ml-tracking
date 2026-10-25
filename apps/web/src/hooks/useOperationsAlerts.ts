import { operationsApi } from '../api/operations';
import { useQuery } from './useQuery';

// APIの監視は30秒ごとに確かめる。それより速くポーリングしても、同じ答えが繰り返されるだけ。
export const OPERATIONS_ALERT_POLL_MS = 30_000;

/**
 * 利用者が開けるすべてのProjectの、開いている運用アラート。上部バーを出している間は更新し、
 * ほかのProjectのworkerが止まったことを、そのProjectを開かなくても分かるようにする。
 */
export function useOperationsAlerts() {
  return useQuery({ key: 'operations-alerts', load: operationsApi.openAlerts, pollMs: OPERATIONS_ALERT_POLL_MS });
}
