import type {
  TargetCheck,
  TargetCheckKind,
  TargetCheckWorker,
  TargetDirectoryListing,
} from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

// workerは手が空いている間、数秒ごとに確認をpollする。5分claimされなければ、そのコンピュータを
// 担当するworkerがいない（または1つも動いていない）とみなす。
const TARGET_CHECK_QUEUE_TIMEOUT_SECONDS = 300;
// workerの検査は2分で打ち切られる（target_probe.py）。その報告が届くまでの余裕を見る。
const TARGET_CHECK_CLAIM_TIMEOUT_SECONDS = 300;
// ディレクトリの一覧はパスを入力中の人に答えるもので、選ばれたworkerは2秒ごとにpollする。
// 1分claimされなければ、そのworkerはいなくなったとみなす。
const DIRECTORY_LISTING_QUEUE_TIMEOUT_SECONDS = 60;
// workerはディレクトリの読み取りを20秒で打ち切る（directory_listing.py）。
const DIRECTORY_LISTING_CLAIM_TIMEOUT_SECONDS = 60;
// 画面はダイアログを開いている間、読んだ内容を持っている。行は残す価値のある履歴ではない。
const DIRECTORY_LISTING_RETENTION_SECONDS = 24 * 60 * 60;

const assignedWorkerSql = `CASE WHEN assigned_token_id IS NULL THEN NULL
  ELSE json_build_object('tokenId',assigned_token_id,'workerId',assigned_worker_id) END AS assigned_worker`;

// lease_idとworker_token_idはworkerを認可するためのもので、画面には返さない。
export const CHECK_COLUMNS = `id,target_id,requested_by,status,worker_id,${assignedWorkerSql},result,
  failure_reason,created_at,claimed_at,finished_at`;
const LISTING_COLUMNS = `id,target_id,directory_path AS path,${assignedWorkerSql},status,worker_id,
  result,failure_reason,created_at,finished_at`;

export async function findCheck(
  connection: Connection,
  checkId: string,
): Promise<TargetCheck | undefined> {
  return first<TargetCheck>(
    connection,
    `SELECT ${CHECK_COLUMNS} FROM target_checks WHERE id=$1 AND kind='connection'`,
    [checkId],
  );
}

export async function findListing(
  connection: Connection,
  listing: { targetId: string; listingId: string },
): Promise<TargetDirectoryListing | undefined> {
  return first<TargetDirectoryListing>(
    connection,
    `SELECT ${LISTING_COLUMNS} FROM target_checks
    WHERE id=$1 AND target_id=$2 AND kind='directory_listing'`,
    [listing.listingId, listing.targetId],
  );
}

/** claimしたあとにworkerが見るリクエスト。確認の項目と、その種類とディレクトリ。 */
export async function findClaimedRequest(
  connection: Connection,
  checkId: string,
): Promise<{
  check: TargetCheck;
  kind: TargetCheckKind;
  directoryPath: string | null;
  leaseId: string;
}> {
  const found = (await first<TargetCheck & {
    kind: TargetCheckKind;
    directoryPath: string | null;
    leaseId: string;
  }>(
    connection,
    `SELECT ${CHECK_COLUMNS},kind,directory_path,lease_id FROM target_checks WHERE id=$1`,
    [checkId],
  ))!;
  const { kind, directoryPath, leaseId, ...check } = found;
  return { check, kind, directoryPath, leaseId };
}

export async function insertConnectionCheck(
  connection: Connection,
  check: { targetId: string; requestedBy: string; worker: TargetCheckWorker | null },
): Promise<TargetCheck | undefined> {
  return first<TargetCheck>(
    connection,
    `INSERT INTO target_checks(target_id,requested_by,assigned_token_id,assigned_worker_id)
    VALUES($1,$2,$3,$4)
    ON CONFLICT (target_id) WHERE status IN ('queued','claimed') AND kind='connection' DO NOTHING
    RETURNING ${CHECK_COLUMNS}`,
    [check.targetId, check.requestedBy, check.worker?.tokenId ?? null, check.worker?.workerId ?? null],
  );
}

export async function insertListing(
  connection: Connection,
  listing: { targetId: string; requestedBy: string; path: string; worker: TargetCheckWorker },
): Promise<TargetDirectoryListing> {
  return (await first<TargetDirectoryListing>(
    connection,
    `INSERT INTO target_checks(target_id,requested_by,kind,directory_path,assigned_token_id,assigned_worker_id)
    VALUES($1,$2,'directory_listing',$3,$4,$5) RETURNING ${LISTING_COLUMNS}`,
    [
      listing.targetId,
      listing.requestedBy,
      listing.path,
      listing.worker.tokenId,
      listing.worker.workerId,
    ],
  ))!;
}

/** コンピュータでworkerを待っているディレクトリ一覧の要求のうち、同じパスのものと、要求の数。 */
export async function findOpenListings(
  connection: Connection,
  listing: { targetId: string; path: string; worker: TargetCheckWorker },
): Promise<{ samePath: TargetDirectoryListing | undefined; count: number }> {
  const found = (await first<{ samePathId: string | null; count: number }>(
    connection,
    `SELECT count(*)::int AS count,
      (array_agg(id ORDER BY created_at DESC) FILTER (WHERE directory_path=$2
        AND assigned_token_id=$3 AND assigned_worker_id=$4))[1] AS same_path_id
    FROM target_checks WHERE target_id=$1 AND kind='directory_listing' AND status IN ('queued','claimed')`,
    [listing.targetId, listing.path, listing.worker.tokenId, listing.worker.workerId],
  ))!;
  return {
    count: found.count,
    samePath: found.samePathId
      ? await findListing(connection, { targetId: listing.targetId, listingId: found.samePathId })
      : undefined,
  };
}

/**
 * 誰も終えない要求を終わらせ、コンピュータが開いたままの確認で止まらないようにする。あわせて、
 * ずっと前に読んだディレクトリの一覧を消す。
 */
export async function expireStaleChecks(connection: Connection): Promise<void> {
  await connection.query(
    `UPDATE target_checks SET status='failed',finished_at=now(),
    failure_reason=CASE WHEN status='queued' THEN 'no_worker' ELSE 'claim_timeout' END
    WHERE (status='queued' AND created_at < now()-make_interval(secs=>
        CASE WHEN kind='connection' THEN $1::float8 ELSE $3::float8 END))
    OR (status='claimed' AND claimed_at < now()-make_interval(secs=>
        CASE WHEN kind='connection' THEN $2::float8 ELSE $4::float8 END))`,
    [
      TARGET_CHECK_QUEUE_TIMEOUT_SECONDS,
      TARGET_CHECK_CLAIM_TIMEOUT_SECONDS,
      DIRECTORY_LISTING_QUEUE_TIMEOUT_SECONDS,
      DIRECTORY_LISTING_CLAIM_TIMEOUT_SECONDS,
    ],
  );
  await connection.query(
    `DELETE FROM target_checks WHERE kind='directory_listing' AND finished_at < now()-make_interval(secs=>$1)`,
    [DIRECTORY_LISTING_RETENTION_SECONDS],
  );
}
