import type { Run, RunKind } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { runSummarySelect } from './runListProjection.js';

// Runのページをたどる関係。列はこの決まった組から選び、入力からは取らない。
export type RunRelation =
  | { column: 'model_version_id'; id: string }
  | { column: 'parent_run_id'; id: string };

export interface RelatedRunBoundary {
  id: string;
  createdAt: string;
}

// cursorのRunの(createdAt, id)。関係が無ければundefined。時刻は文字列のままにする。
// JavaScriptのDateにすると、境界からPostgreSQLのマイクロ秒が落ちる。
export async function findRelatedRunBoundary(
  connection: Connection,
  reference: { projectId: string; relation: RunRelation; runId: string },
): Promise<RelatedRunBoundary | undefined> {
  return first(
    connection,
    `SELECT id,created_at::text AS created_at FROM runs
    WHERE project_id=$1 AND ${reference.relation.column}=$2 AND id=$3`,
    [reference.projectId, reference.relation.id, reference.runId],
  );
}

// 論理削除されていない関係するRunを新しい順に返す。kindsがnullならすべての種類。
export async function listRelatedRuns(
  connection: Connection,
  page: {
    projectId: string;
    relation: RunRelation;
    kinds: readonly RunKind[] | null;
    limit: number;
    after?: RelatedRunBoundary;
  },
): Promise<Run[]> {
  return rows(
    connection,
    `${runSummarySelect}
    WHERE project_id=$1 AND ${page.relation.column}=$2 AND lifecycle_stage='active'
      AND ($3::text[] IS NULL OR kind=ANY($3::text[]))
      AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid))
    ORDER BY created_at DESC,id DESC LIMIT $6`,
    [
      page.projectId,
      page.relation.id,
      page.kinds,
      page.after?.createdAt ?? null,
      page.after?.id ?? null,
      page.limit,
    ],
  );
}
