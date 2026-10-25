import { z } from 'zod';
import {
  OPERATIONS_ALERT_MAX_PAGE_SIZE,
  type OperationsAlertKind,
  type OperationsAlertResolution,
} from '@mmt/contracts';
import { JOB_HEARTBEAT_STALE_SECONDS, WORKER_OFFLINE_SECONDS } from './workerLiveness.js';

// 合意した閾値（decisions.md）。イベントが15分届かないままか、1つのイベントを5回試行しても
// 成功しないとき、pluginが止まっているとみなす。
export const PLUGIN_STALL_SECONDS = 900;
export const PLUGIN_STALL_ATTEMPTS = 5;
// 1週間応答の無いworkerは引退した（ホストの名前が変わったか、外された）とみなし、新しい
// アラートを開かず、古いアラートもいつまでも開いたままにしない。
export const WORKER_RETIRED_SECONDS = 7 * 24 * 60 * 60;

// 履歴の表示は、多くを求めない限り新しい50件ずつページを送る。
const DEFAULT_ALERT_PAGE_SIZE = 50;

export const operationsAlertQuerySchema = z.strictObject({
  state: z.enum(['open', 'all']).default('open'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(OPERATIONS_ALERT_MAX_PAGE_SIZE)
    .default(DEFAULT_ALERT_PAGE_SIZE),
});

export type OperationsAlertDetail = Record<string, string | number | boolean | null>;

/** 今回の周期で監視が見る対象。isAlertingは、開いたアラートを持つべきかを表す。 */
export interface MonitoredSubject {
  kind: OperationsAlertKind;
  subjectId: string;
  projectId: string;
  isAlerting: boolean;
  detail: OperationsAlertDetail;
}

export interface OpenAlertReference {
  id: string;
  kind: OperationsAlertKind;
  subjectId: string;
}

export interface AlertResolution<Subject extends MonitoredSubject> {
  alert: OpenAlertReference;
  resolution: OperationsAlertResolution;
  /** 今回の周期で読んだ対象。もう監視していなければ無い。 */
  subject?: Subject;
}

export interface AlertChangePlan<Subject extends MonitoredSubject> {
  open: Subject[];
  resolve: AlertResolution<Subject>[];
}

export function isJobHeartbeatStale(heartbeatAgeSeconds: number): boolean {
  return heartbeatAgeSeconds > JOB_HEARTBEAT_STALE_SECONDS;
}

export function isWorkerOffline(silentSeconds: number): boolean {
  return silentSeconds > WORKER_OFFLINE_SECONDS;
}

export function isWorkerRetired(silentSeconds: number): boolean {
  return silentSeconds > WORKER_RETIRED_SECONDS;
}

/**
 * 未送信には送信中のイベントも含む。送っている途中の再試行もまだ滞留の一部なので、dispatcherが
 * イベントを取るたびにアラートが解消して開き直すことはない。
 */
export function isPluginDeliveryStalled(backlog: {
  oldestUndeliveredAgeSeconds: number | null;
  maxAttempts: number;
}): boolean {
  if (backlog.oldestUndeliveredAgeSeconds === null) return false;
  return (
    backlog.oldestUndeliveredAgeSeconds > PLUGIN_STALL_SECONDS ||
    backlog.maxAttempts >= PLUGIN_STALL_ATTEMPTS
  );
}

function subjectKey(reference: { kind: OperationsAlertKind; subjectId: string }): string {
  return `${reference.kind}\u0000${reference.subjectId}`;
}

/**
 * 開いているアラートと今回の周期で読んだ対象を比べる。アラート状態なのに開いたアラートが無い
 * 対象には、アラートを開く。開いたアラートのうち、対象がアラート状態でなくなったものは
 * recovered、対象をもう監視していないものはinactiveとして解消する。
 */
export function planAlertChanges<Subject extends MonitoredSubject>(
  openAlerts: readonly OpenAlertReference[],
  subjects: readonly Subject[],
): AlertChangePlan<Subject> {
  const subjectsByKey = new Map(subjects.map((subject) => [subjectKey(subject), subject]));
  const openKeys = new Set(openAlerts.map(subjectKey));
  const resolve: AlertResolution<Subject>[] = [];
  for (const alert of openAlerts) {
    const subject = subjectsByKey.get(subjectKey(alert));
    if (!subject) resolve.push({ alert, resolution: 'inactive' });
    else if (!subject.isAlerting) resolve.push({ alert, resolution: 'recovered', subject });
  }
  const open = subjects.filter(
    (subject) => subject.isAlerting && !openKeys.has(subjectKey(subject)),
  );
  return { open, resolve };
}
