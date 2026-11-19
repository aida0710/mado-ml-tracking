/**
 * 運用のアラートの種別。各kindは、アラートが開いたときにキューに入れる
 * NotificationEventTypeでもある。job.heartbeat_staleは、回復したときに
 * job.heartbeat_recoveredもキューに入れる。plugin.delivery_stalledを開く監視はもう無く、
 * 過去に開いたアラートを一覧で読むためだけに残している。
 */
export type OperationsAlertKind = 'job.heartbeat_stale' | 'worker.offline' | 'plugin.delivery_stalled';

export const OPERATIONS_ALERT_KINDS: readonly OperationsAlertKind[] = [
  'job.heartbeat_stale',
  'worker.offline',
  'plugin.delivery_stalled',
];

/**
 * recovered: 状態が解消した（heartbeatが戻った、workerが応答した）。
 * inactive: 対象をもう見張らない（Jobが終わった、worker tokenが取り消されたか期限が切れた、
 * workerが引退したとみなせるほど長く応答しない、連携のイベントの送信を見張らなくなった）。
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
