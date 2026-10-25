// ブラウザでの確認に使うGET /projects/:p/automation-executions。
// apps/api/src/repositories/modelAutomationRepository.tsの決まりどおり、新しい順（createdAt、
// 次にid）に並べ、ruleIdとmodelVersionIdで絞り、1ページに`limit`行と次のページへのcursorを返す。

// APIの既定のページサイズ（DEFAULT_AUTOMATION_EXECUTION_LIMIT）。
const DEFAULT_LIMIT = 100;

const newestFirst = (left, right) =>
  left.createdAt === right.createdAt
    ? (left.id < right.id ? 1 : -1)
    : (left.createdAt < right.createdAt ? 1 : -1);

/** 実行の1ページ分。古い行が残っている間は、`nextCursor`は最後の行のid。 */
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
