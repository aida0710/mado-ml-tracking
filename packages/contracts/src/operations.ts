/**
 * 運用の監視が見張る状態。各kindは、アラートが開いたときにキューに入れる
 * NotificationEventTypeでもある。job.heartbeat_staleは、回復したときに
 * job.heartbeat_recoveredもキューに入れる。
 */
export type OperationsAlertKind = 'job.heartbeat_stale' | 'worker.offline' | 'plugin.delivery_stalled';

export const OPERATIONS_ALERT_KINDS: readonly OperationsAlertKind[] = [
  'job.heartbeat_stale',
  'worker.offline',
  'plugin.delivery_stalled',
];

/**
 * recovered: 状態が解消した（heartbeatが戻った、workerが応答した、イベントが配信された）。
 * inactive: 対象をもう見張らない（Jobが終わった、worker tokenが取り消されたか期限が切れた、
 * workerが引退したとみなせるほど長く応答しない、連携が無効になった）。
 */
export type OperationsAlertResolution = 'recovered' | 'inactive';

export type OperationsAlertState = 'open' | 'all';

/** 一覧の1リクエストで返すアラートの最大数。ヘッダーのベルはこの数を求める。 */
export const OPERATIONS_ALERT_MAX_PAGE_SIZE = 200;

/**
 * 見張っている状態の1回の発生。検知から解消までを表す。subjectIdはJobのid、workerなら
 * `<token id>:<worker id>`、または連携の接続のid。detailはアラートが開いたときに取った
 * スナップショットで、シークレットや相手の応答は入れない。
 */
export interface OperationsAlert {
  id: string;
  projectId: string;
  kind: OperationsAlertKind;
  subjectId: string;
  openedAt: string;
  resolvedAt: string | null;
  resolution: OperationsAlertResolution | null;
  detail: Record<string, string | number | boolean | null>;
}

/** 1つの連携のイベントのoutboxの配信状況。時刻はISO形式のUTCで、無ければnull。 */
export interface PluginOutboxSummary {
  /** 次の試行を待っているイベントの数。 */
  pending: number;
  /** dispatcherが今送っているイベントの数。 */
  sending: number;
  oldestPendingAt: string | null;
  /** 未配信のイベント1件に対する試行回数の最大値。待っているものが無ければ0。 */
  maxAttempts: number;
  /** 試行回数が最も多い未配信のイベントの失敗のコード。相手の応答は入れない。 */
  lastError: string | null;
  lastDeliveredAt: string | null;
  /** 監視が、その連携が止まっていると判断したか（有効で、時間か試行回数の上限を超えている）。 */
  stalled: boolean;
}
