import type { OperationsAlert } from '@mmt/contracts';
import type { PoolClient } from 'pg';
import { transaction, type Database } from '../db/database.js';
import {
  isJobHeartbeatStale,
  isPluginDeliveryStalled,
  isWorkerOffline,
  isWorkerRetired,
  planAlertChanges,
  type MonitoredSubject,
} from '../domain/operationsAlerts.js';
import {
  insertOpenAlert,
  listActiveJobHeartbeats,
  listEnabledPluginBacklogs,
  listOpenAlerts,
  listWorkerSilences,
  resolveAlert,
  type ActiveJobHeartbeat,
  type PluginBacklog,
  type WorkerSilence,
} from '../repositories/operationsAlertRepository.js';
import { enqueueNotificationEvent, type NotificationSubject } from './notificationEvents.js';
import { PollingLoop } from './pollingLoop.js';

// Jobのheartbeatのしきい値の半分。止まったJobを、最後のheartbeatから90秒以内に報告する。
export const OPERATIONS_MONITOR_INTERVAL_MS = 30_000;
// 同じスキーマのすべてのAPIプロセスで共有し、一度に1つだけが確認するようにする。
const MONITOR_LOCK_NAME = 'operations_monitor';

/** 監視対象と、保存したdetailのほかに通知に要る情報。 */
interface WatchedSubject extends MonitoredSubject {
  name: string;
  webPath: string;
  notificationSubject: NotificationSubject;
}

export interface OperationsMonitorTick {
  /** 別のプロセスが監視のロックを持っていて、この回は何もしなかったときはfalse。 */
  acquired: boolean;
  opened: number;
  resolved: number;
}

const OPENED_TITLES: Record<MonitoredSubject['kind'], string> = {
  'job.heartbeat_stale': 'Jobのheartbeatが途絶えました',
  'worker.offline': 'workerが応答しません',
  'plugin.delivery_stalled': 'Pluginへのイベント送信が滞留しています',
};
const JOB_RECOVERED_TITLE = 'Jobのheartbeatが戻りました';

function jobSubject(job: ActiveJobHeartbeat): WatchedSubject {
  return {
    kind: 'job.heartbeat_stale',
    subjectId: job.jobId,
    projectId: job.projectId,
    isAlerting: isJobHeartbeatStale(job.heartbeatAgeSeconds),
    detail: {
      jobId: job.jobId,
      runId: job.runId,
      runName: job.runName,
      workerId: job.workerId,
      heartbeatAt: job.heartbeatAt,
    },
    name: job.runName,
    webPath: `runs/${encodeURIComponent(job.runId)}`,
    notificationSubject: { runKind: job.runKind, experimentId: job.experimentId },
  };
}

function workerSubject(worker: WorkerSilence): WatchedSubject {
  return {
    kind: 'worker.offline',
    subjectId: `${worker.tokenId}:${worker.workerId}`,
    projectId: worker.projectId,
    isAlerting: isWorkerOffline(worker.silentSeconds),
    detail: {
      workerId: worker.workerId,
      hostname: worker.hostname,
      tokenName: worker.tokenName,
      lastSeenAt: worker.lastSeenAt,
      activeJobCount: worker.activeJobCount,
    },
    name: worker.hostname ? `${worker.workerId} (${worker.hostname})` : worker.workerId,
    webPath: 'compute',
    notificationSubject: {},
  };
}

function pluginSubject(backlog: PluginBacklog): WatchedSubject {
  return {
    kind: 'plugin.delivery_stalled',
    subjectId: backlog.pluginId,
    projectId: backlog.projectId,
    isAlerting: isPluginDeliveryStalled(backlog),
    detail: {
      pluginId: backlog.pluginId,
      pluginName: backlog.pluginName,
      undelivered: backlog.pending + backlog.sending,
      oldestPendingAt: backlog.oldestPendingAt,
      maxAttempts: backlog.maxAttempts,
      lastError: backlog.lastError,
    },
    name: backlog.pluginName,
    webPath: 'plugins',
    notificationSubject: {},
  };
}

/**
 * Jobのheartbeat、workerのpresence、pluginのイベントの配信を30秒ごとに監視し、出来事1つにつき
 * operations_alertsの行を1つ持ち、アラートが始まったとき（と、止まっていたJobのheartbeatが
 * 戻ったとき）だけ通知をキューに入れる。各回はadvisory lockの下の1つのトランザクションなので、
 * 通知はアラートの行と一緒にコミットされ、APIプロセスが二重に報告することはない。
 */
export class OperationsMonitor {
  private readonly loop: PollingLoop;

  constructor(
    private readonly database: Database,
    private readonly options: { webOrigin: string },
  ) {
    this.loop = new PollingLoop({
      intervalMs: OPERATIONS_MONITOR_INTERVAL_MS,
      run: () => this.tick(),
      failureEvent: 'operations_monitor_failed',
    });
  }

  start(): void {
    this.loop.start();
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  async tick(): Promise<OperationsMonitorTick> {
    return transaction(this.database, async (connection) => {
      const lock = await connection.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1||':'||current_schema(),0)) AS acquired",
        [MONITOR_LOCK_NAME],
      );
      if (!lock.rows[0]?.acquired) return { acquired: false, opened: 0, resolved: 0 };
      const subjects = await this.readSubjects(connection);
      const plan = planAlertChanges(await listOpenAlerts(connection), subjects);
      let opened = 0;
      for (const subject of plan.open) {
        const alert = await insertOpenAlert(connection, subject);
        if (!alert) continue;
        opened++;
        await this.notify(connection, { alert, subject, type: subject.kind });
      }
      let resolved = 0;
      for (const change of plan.resolve) {
        const alert = await resolveAlert(connection, {
          alertId: change.alert.id,
          resolution: change.resolution,
        });
        if (!alert) continue;
        resolved++;
        // 回復のイベントがあるのはJobだけ。終わったJobは、代わりにそのRunを通して報告する。
        if (alert.kind === 'job.heartbeat_stale' && change.subject)
          await this.notify(connection, {
            alert,
            subject: change.subject,
            type: 'job.heartbeat_recovered',
          });
      }
      return { acquired: true, opened, resolved };
    });
  }

  private async readSubjects(connection: PoolClient): Promise<WatchedSubject[]> {
    const jobs = await listActiveJobHeartbeats(connection);
    const workers = await listWorkerSilences(connection);
    const plugins = await listEnabledPluginBacklogs(connection);
    return [
      ...jobs.map(jobSubject),
      ...workers.filter((worker) => !isWorkerRetired(worker.silentSeconds)).map(workerSubject),
      ...plugins.map(pluginSubject),
    ];
  }

  // 重複除去のキーにアラートのidを含めるので、後で再び失敗した対象はもう一度通知する。
  private async notify(
    connection: PoolClient,
    event: {
      alert: OperationsAlert;
      subject: WatchedSubject;
      type: OperationsAlert['kind'] | 'job.heartbeat_recovered';
    },
  ): Promise<void> {
    const { alert, subject } = event;
    const title =
      event.type === 'job.heartbeat_recovered' ? JOB_RECOVERED_TITLE : OPENED_TITLES[event.type];
    await enqueueNotificationEvent(connection, {
      projectId: alert.projectId,
      type: event.type,
      dedupeKey: `${event.type}:${alert.id}`,
      subject: subject.notificationSubject,
      describe: async () => ({
        title: `${title}: ${subject.name}`,
        run: null,
        details: { alertId: alert.id, ...subject.detail },
        url: `${this.options.webOrigin}/projects/${encodeURIComponent(alert.projectId)}/${subject.webPath}`,
        occurredAt: alert.resolvedAt ?? alert.openedAt,
      }),
    });
  }
}
