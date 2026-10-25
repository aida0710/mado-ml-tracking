import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction, type Database } from '../db/database.js';

/** claim・lease・backoffの列を共有するoutboxのテーブル。 */
export type LeasedOutboxTable = 'plugin_outbox' | 'notification_outbox';

export interface LeasedOutboxPolicy {
  table: LeasedOutboxTable;
  /** 送信側のHTTPの期限より長くし、別のdispatcherが同時に送れないようにする。 */
  leaseSeconds: number;
  firstRetrySeconds: number;
  maxRetrySeconds: number;
  /** この回数だけ試行が失敗すると、行は'failed'になる。未設定なら再試行し続ける。 */
  maxAttempts?: number;
  /** 送信側がOutboxDeliveryError以外を投げたときに、last_errorとして保存する。 */
  defaultErrorCode: string;
}

export interface OutboxRow {
  id: string;
  /** このclaimより前に行った試行の数。保存されている値のまま。 */
  attempts: number;
}

/** claimした行。attemptはこの試行を含めた回数（初回は1）。 */
export type Lease<Row extends OutboxRow> = Row & { deliveryId: string; attempt: number };

/**
 * 保存しても安全なコードを持つ、送信側の失敗。相手の応答やURLは決して入れない。permanentは、
 * 再試行では直らない失敗のために、残りの試行を飛ばす。
 */
export class OutboxDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly options: { permanent?: boolean } = {},
  ) {
    super(code);
    this.name = 'OutboxDeliveryError';
  }
}

/** 配信済みの行がstatusのほかに保存する列。受け取り側に見せる配信IDなど。 */
export interface DeliveryReceipt {
  columns?: Readonly<Record<string, string>>;
}

const COLUMN_NAME = /^[a-z_]+$/;
// 指数に上限を置き、maxRetryの上限をかける前の倍々の計算が整数の範囲に収まるようにする。
const MAX_BACKOFF_EXPONENT = 10;

/**
 * 送る時刻になった行か、送信中のleaseが切れた行を選ぶ。`alias`はoutboxのテーブルに付けた別名、
 * `leaseParameter`はleaseの秒数を入れたSQLのパラメーター。
 */
export function claimableCondition(alias: string, leaseParameter: string): string {
  return `((${alias}.status='pending' AND ${alias}.next_attempt_at<=now()) OR (${alias}.status='sending' AND ${alias}.locked_at<now()-make_interval(secs=>${leaseParameter})))`;
}

export function retryDelaySeconds(policy: LeasedOutboxPolicy, attempt: number): number {
  return Math.min(
    policy.maxRetrySeconds,
    policy.firstRetrySeconds * 2 ** Math.min(attempt - 1, MAX_BACKOFF_EXPONENT),
  );
}

/**
 * outboxのテーブルのclaim → 送信 → 記録。pluginのイベントと通知で共有する。claimは、
 * FOR UPDATE SKIP LOCKEDで行を選んだトランザクションの中で、新しい配信IDを付けて行を'sending'に
 * する。結果はその配信IDがまだ有効な間だけ書くので、leaseが切れたdispatcherが、引き継いだ試行を
 * 上書きすることはない。
 */
export class LeasedOutbox {
  constructor(
    private readonly database: Database,
    private readonly policy: LeasedOutboxPolicy,
  ) {}

  /**
   * 最大`limit`行を1行ずつ送る。`select`はclaimのトランザクションの中で動き、返す行をロックする
   * こと（claimableConditionを使ったFOR UPDATE … SKIP LOCKED）。配信できた数を返す。
   */
  async dispatchBatch<Row extends OutboxRow>(request: {
    limit: number;
    select: (connection: PoolClient, leaseSeconds: number) => Promise<Row | undefined>;
    send: (lease: Lease<Row>) => Promise<DeliveryReceipt | void>;
  }): Promise<number> {
    let delivered = 0;
    for (let index = 0; index < request.limit; index++) {
      const lease = await this.claim(request.select);
      if (!lease) break;
      try {
        const receipt = await request.send(lease);
        await this.markDelivered(lease, receipt ?? {});
        delivered++;
      } catch (error) {
        await this.markFailedAttempt(lease, error);
      }
    }
    return delivered;
  }

  private async claim<Row extends OutboxRow>(
    select: (connection: PoolClient, leaseSeconds: number) => Promise<Row | undefined>,
  ): Promise<Lease<Row> | null> {
    return transaction(this.database, async (connection) => {
      const row = await select(connection, this.policy.leaseSeconds);
      if (!row) return null;
      const deliveryId = randomUUID();
      await connection.query(
        `UPDATE ${this.policy.table} SET status='sending',delivery_id=$2,locked_at=now(),attempts=attempts+1 WHERE id=$1`,
        [row.id, deliveryId],
      );
      return { ...row, deliveryId, attempt: row.attempts + 1 };
    });
  }

  private async markDelivered(
    lease: { id: string; deliveryId: string },
    receipt: DeliveryReceipt,
  ): Promise<void> {
    const extra = Object.entries(receipt.columns ?? {});
    if (extra.some(([column]) => !COLUMN_NAME.test(column)))
      throw new Error('Invalid outbox receipt column');
    const assignments = extra.map(([column], index) => `,${column}=$${index + 3}`).join('');
    await this.database.query(
      `UPDATE ${this.policy.table} SET status='delivered',delivered_at=now(),last_error=NULL,delivery_id=NULL,locked_at=NULL${assignments} WHERE id=$1 AND delivery_id=$2`,
      [lease.id, lease.deliveryId, ...extra.map(([, value]) => value)],
    );
  }

  private async markFailedAttempt(
    lease: { id: string; deliveryId: string; attempt: number },
    error: unknown,
  ): Promise<void> {
    // 保存するのは安全な失敗のコード。相手のサービスの応答や認証情報を含むURLは保存しない。
    const isKnown = error instanceof OutboxDeliveryError;
    const code = isKnown ? error.code : this.policy.defaultErrorCode;
    const { maxAttempts } = this.policy;
    const isFinal =
      (isKnown && error.options.permanent === true) ||
      (maxAttempts !== undefined && lease.attempt >= maxAttempts);
    if (isFinal) {
      await this.database.query(
        `UPDATE ${this.policy.table} SET status='failed',last_error=$3,delivery_id=NULL,locked_at=NULL WHERE id=$1 AND delivery_id=$2`,
        [lease.id, lease.deliveryId, code],
      );
      return;
    }
    await this.database.query(
      `UPDATE ${this.policy.table} SET status='pending',next_attempt_at=now()+make_interval(secs=>$3),last_error=$4,delivery_id=NULL,locked_at=NULL WHERE id=$1 AND delivery_id=$2`,
      [lease.id, lease.deliveryId, retryDelaySeconds(this.policy, lease.attempt), code],
    );
  }
}
