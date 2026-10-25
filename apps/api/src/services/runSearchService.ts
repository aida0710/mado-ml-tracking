import type { Run, RunKind, RunSearchPage, RunStatus } from '@mmt/contracts';
import type { PoolClient } from 'pg';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { compileSearchExpression } from '../domain/runSearch/runSearchCompiler.js';
import {
  decodeRunSearchCursor,
  encodeRunSearchCursor,
  runSearchConditionsFingerprint,
  type RunSearchCursor,
} from '../domain/runSearch/runSearchPage.js';
import { runSummarySelect } from '../repositories/runListProjection.js';
import { assertProjectReference } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';

/** 検証済みの検索のリクエスト。指定の無い一覧の条件は空、指定の無い値はnullになる。 */
export interface RunSearchQuery {
  experimentIds: string[];
  filter: string;
  orderBy: string[];
  kinds: RunKind[];
  statuses: RunStatus[];
  modelVersionIds: string[];
  inputDatasetVersionIds: string[];
  parentRunId: string | null;
  name: string | null;
  limit: number;
  cursor: string | null;
}
export type RunSearchConditions = Omit<RunSearchQuery, 'limit' | 'cursor'>;

// 検索が返すページの最大の大きさ。一致したものをすべて集めるのに要るページを最も少なくする。
const COLLECT_PAGE_SIZE = 500;

// migration 020の部分インデックスに合わせ、新しい順のkeysetがそのインデックスを直接
// 読めるようにする。
const CREATION_ORDER = 'r.created_at DESC,r.id DESC';

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// 集合のような条件は並べ替えておき、クライアントが同じ絞り込みの値を並べ替えてもカーソルが
// 有効なままにする。
function normalizeConditions(query: RunSearchQuery): RunSearchConditions {
  const sortedUnique = <T extends string>(values: T[]) => [...new Set(values)].sort();
  return {
    experimentIds: sortedUnique(query.experimentIds),
    filter: query.filter.trim(),
    orderBy: query.orderBy.map((order) => order.trim()),
    kinds: sortedUnique(query.kinds),
    statuses: sortedUnique(query.statuses),
    modelVersionIds: sortedUnique(query.modelVersionIds),
    inputDatasetVersionIds: sortedUnique(query.inputDatasetVersionIds),
    parentRunId: query.parentRunId,
    name: query.name,
  };
}

export class RunSearchService {
  constructor(private readonly database: Database) {}

  async search(
    principal: Principal,
    projectId: string,
    query: RunSearchQuery,
  ): Promise<RunSearchPage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const conditions = normalizeConditions(query);
    for (const id of conditions.experimentIds)
      await assertProjectReference(this.database, { table: 'experiments', projectId, id });
    const fingerprint = runSearchConditionsFingerprint({ projectId, ...conditions });
    const mode = conditions.orderBy.length ? 'offset' : 'keyset';
    const cursor = query.cursor ? decodeRunSearchCursor(query.cursor, { fingerprint, mode }) : null;
    // 2回の読み取りは同じスナップショットを見るので、その間に削除されたRunがページに
    // 穴を空けることはない。
    return transaction(this.database, async (connection) => {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const runIds = await this.findPageRunIds(connection, {
        projectId,
        conditions,
        cursor,
        limit: query.limit,
      });
      const pageRunIds = runIds.slice(0, query.limit);
      const items = await this.readSummaries(connection, { projectId, runIds: pageRunIds });
      const hasMore = runIds.length > query.limit;
      const nextCursor: RunSearchCursor | null = !hasMore
        ? null
        : mode === 'keyset'
          ? { mode, afterRunId: pageRunIds.at(-1)! }
          : { mode, offset: (cursor?.mode === 'offset' ? cursor.offset : 0) + query.limit };
      return {
        items,
        nextCursor: nextCursor && encodeRunSearchCursor(nextCursor, fingerprint),
      };
    });
  }

  /**
   * 条件に一致するすべてのRunのID（検索の順）。Runの集合を丸ごと読むエンドポイント（メトリクスの
   * グループ、分析、レポートのスナップショット）が使う。maxRunsを超えたら422 too_many_runs。
   */
  async collectRunIds(
    principal: Principal,
    projectId: string,
    request: { conditions: RunSearchConditions; maxRuns: number },
  ): Promise<string[]> {
    const runIds: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.search(principal, projectId, {
        ...request.conditions,
        limit: COLLECT_PAGE_SIZE,
        cursor,
      });
      runIds.push(...page.items.map((run) => run.id));
      if (runIds.length > request.maxRuns)
        throw new DomainError({
          status: 422,
          code: 'too_many_runs',
          message: `more than ${request.maxRuns} runs match the search; narrow down the conditions`,
          details: { limit: request.maxRuns },
        });
      cursor = page.nextCursor;
    } while (cursor);
    return runIds;
  }

  private async findPageRunIds(
    connection: PoolClient,
    page: {
      projectId: string;
      conditions: RunSearchConditions;
      cursor: RunSearchCursor | null;
      limit: number;
    },
  ): Promise<string[]> {
    const { projectId, conditions, cursor } = page;
    const search = compileSearchExpression(
      'run',
      { filter: conditions.filter, orderBy: conditions.orderBy },
      [projectId],
    );
    const bind = (value: unknown) => `$${search.parameters.push(value)}`;
    const where = ['r.project_id=$1', "r.lifecycle_stage='active'", search.filter];
    if (conditions.experimentIds.length)
      where.push(`r.experiment_id=ANY(${bind(conditions.experimentIds)}::uuid[])`);
    if (conditions.kinds.length) where.push(`r.kind=ANY(${bind(conditions.kinds)}::text[])`);
    if (conditions.statuses.length)
      where.push(`r.status=ANY(${bind(conditions.statuses)}::text[])`);
    if (conditions.modelVersionIds.length)
      where.push(`r.model_version_id=ANY(${bind(conditions.modelVersionIds)}::uuid[])`);
    if (conditions.inputDatasetVersionIds.length)
      where.push(
        `r.input_dataset_version_ids && ${bind(conditions.inputDatasetVersionIds)}::uuid[]`,
      );
    if (conditions.parentRunId) where.push(`r.parent_run_id=${bind(conditions.parentRunId)}`);
    if (conditions.name)
      where.push(`r.name ILIKE '%'||${bind(escapeLikePattern(conditions.name))}||'%'`);
    if (cursor?.mode === 'keyset') {
      const after = await first(connection, 'SELECT 1 FROM runs WHERE project_id=$1 AND id=$2', [
        projectId,
        cursor.afterRunId,
      ]);
      if (!after) throw new DomainError({
        status: 400,
        code: 'invalid_cursor',
        message: 'the run of the cursor was not found',
      });
      where.push(
        `(r.created_at,r.id) < (SELECT c.created_at,c.id FROM runs c WHERE c.project_id=$1 AND c.id=${bind(cursor.afterRunId)})`,
      );
    }
    const orderBy = conditions.orderBy.length ? search.orderBy : CREATION_ORDER;
    const limit = bind(page.limit + 1);
    const offset = bind(cursor?.mode === 'offset' ? cursor.offset : 0);
    const found = await rows<{ id: string }>(
      connection,
      `SELECT r.id FROM runs r WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      search.parameters,
    );
    return found.map((run) => run.id);
  }

  private async readSummaries(
    connection: PoolClient,
    page: { projectId: string; runIds: string[] },
  ): Promise<Run[]> {
    if (!page.runIds.length) return [];
    const summaries = await rows<Run>(
      connection,
      `${runSummarySelect} WHERE project_id=$1 AND id=ANY($2::uuid[])`,
      [page.projectId, page.runIds],
    );
    const summariesById = new Map(summaries.map((run) => [run.id, run]));
    return page.runIds.map((id) => summariesById.get(id)!);
  }
}
