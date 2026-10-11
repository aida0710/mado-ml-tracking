// GET /projects/:p/automation-executions for browser checks, by the rules of
// apps/api/src/repositories/modelAutomationRepository.ts: newest first (createdAt, then id),
// narrowed by ruleId and modelVersionId, `limit` rows per page and a cursor to the next one.

// The API default page size (DEFAULT_AUTOMATION_EXECUTION_LIMIT).
const DEFAULT_LIMIT = 100;

const newestFirst = (left, right) =>
  left.createdAt === right.createdAt
    ? (left.id < right.id ? 1 : -1)
    : (left.createdAt < right.createdAt ? 1 : -1);

/** One page of the executions; `nextCursor` is the last row's id while older rows remain. */
export function pageAutomationExecutions(executions, searchParams) {
  const ruleId = searchParams.get('ruleId');
  const modelVersionId = searchParams.get('modelVersionId');
  const limit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const matching = executions
    .filter((execution) => !ruleId || execution.ruleId === ruleId)
    .filter((execution) => !modelVersionId || execution.modelVersionId === modelVersionId)
    .sort(newestFirst);
  const cursor = searchParams.get('cursor');
  const start = cursor ? matching.findIndex((execution) => execution.id === cursor) + 1 : 0;
  const items = matching.slice(start, start + limit);
  const hasMore = start + limit < matching.length;
  return { items, nextCursor: hasMore ? items.at(-1).id : null };
}
