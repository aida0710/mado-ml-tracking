import type {
  MediaCompareGrid,
  MediaCompareRequest,
  MediaTablePage,
  RunMedia,
  RunMediaKeySummary,
  RunMediaKind,
  RunMediaPage,
} from '@mmt/contracts';
import { encodeId, invalidResponseError, jsonRequest, projectPath, request, requestItems } from './http';

// 1つのキーのメディアの1ページ。スライダーにはキーのすべてのstepが要るので、ページをたどる。
export const RUN_MEDIA_PAGE_LIMIT = 200;
// とても長いRunの全stepで記録されたキーでタブが固まらないよう、ここでページをたどるのをやめる。
export const RUN_MEDIA_MAX_ITEMS = 10_000;

export interface RunMediaQuery {
  key: string;
  kind?: RunMediaKind;
  stepFrom?: number;
  stepTo?: number;
}

export interface RunMediaOfKey {
  items: RunMedia[];
  /** そのキーのRunのメディアがRUN_MEDIA_MAX_ITEMS件より多いときtrue。 */
  truncated: boolean;
}

const runMediaPath = (projectId: string, runId: string) => `${projectPath(projectId)}/runs/${encodeId(runId)}/media`;

function mediaQueryString(query: RunMediaQuery & { cursor?: string; limit: number }): string {
  const parameters = new URLSearchParams({ key: query.key, limit: String(query.limit) });
  if (query.kind) parameters.set('kind', query.kind);
  if (query.stepFrom !== undefined) parameters.set('stepFrom', String(query.stepFrom));
  if (query.stepTo !== undefined) parameters.set('stepTo', String(query.stepTo));
  if (query.cursor) parameters.set('cursor', query.cursor);
  return parameters.toString();
}

async function mediaPage(
  projectId: string,
  runId: string,
  query: RunMediaQuery & { cursor?: string; limit: number },
  signal?: AbortSignal,
): Promise<RunMediaPage> {
  const page = await request<RunMediaPage>(`${runMediaPath(projectId, runId)}?${mediaQueryString(query)}`, { signal });
  // 最後のページにはnextCursorが無い。
  if (!Array.isArray(page.items) || (page.nextCursor !== undefined && typeof page.nextCursor !== 'string'))
    throw invalidResponseError();
  return page;
}

export const runMediaApi = {
  keys: (projectId: string, runId: string, signal?: AbortSignal): Promise<RunMediaKeySummary[]> =>
    requestItems<RunMediaKeySummary>(`${runMediaPath(projectId, runId)}/keys`, signal),
  page: mediaPage,
  /** キーのすべてのメディアをstepの順に返す。cursorはRUN_MEDIA_MAX_ITEMS件までたどる。 */
  list: async (projectId: string, runId: string, query: RunMediaQuery, signal?: AbortSignal): Promise<RunMediaOfKey> => {
    const items: RunMedia[] = [];
    let cursor: string | undefined;
    do {
      const page = await mediaPage(projectId, runId, { ...query, cursor, limit: RUN_MEDIA_PAGE_LIMIT }, signal);
      items.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && items.length < RUN_MEDIA_MAX_ITEMS);
    return { items: items.slice(0, RUN_MEDIA_MAX_ITEMS), truncated: cursor !== undefined };
  },
  compare: async (projectId: string, body: MediaCompareRequest, signal?: AbortSignal): Promise<MediaCompareGrid> => {
    const grid = await request<MediaCompareGrid>(`${projectPath(projectId)}/media/compare`, {
      ...jsonRequest('POST', body),
      signal,
    });
    // 各行は求めたstepごとに1つのセルを持つ。stepを指定しなければ1つのセル（最新のstep）だけ。
    const cellsPerRow = Array.isArray(grid.steps) ? grid.steps.length : 1;
    if (
      (grid.steps !== null && !Array.isArray(grid.steps)) ||
      !Array.isArray(grid.rows) ||
      grid.rows.some((row) => !Array.isArray(row.cells) || row.cells.length !== cellsPerRow)
    )
      throw invalidResponseError();
    return grid;
  },
  /** このArtifactとして保存した表のメディア。ファイルが記録された表でなければnull。 */
  tableOfArtifact: async (
    projectId: string,
    target: { runId: string; artifactId: string },
    signal?: AbortSignal,
  ): Promise<RunMedia | null> => {
    const parameters = new URLSearchParams({ kind: 'table', artifactId: target.artifactId, limit: '1' });
    const page = await request<RunMediaPage>(`${runMediaPath(projectId, target.runId)}?${parameters}`, { signal });
    if (!Array.isArray(page.items)) throw invalidResponseError();
    return page.items[0] ?? null;
  },
  table: async (
    projectId: string,
    target: { runId: string; mediaId: string },
    rows: { offset: number; limit: number },
    signal?: AbortSignal,
  ): Promise<MediaTablePage> => {
    const parameters = new URLSearchParams({ offset: String(rows.offset), limit: String(rows.limit) });
    const page = await request<MediaTablePage>(
      `${runMediaPath(projectId, target.runId)}/${encodeId(target.mediaId)}/table?${parameters}`,
      { signal },
    );
    if (!Array.isArray(page.columns) || !Array.isArray(page.rows) || typeof page.totalRows !== 'number')
      throw invalidResponseError();
    return page;
  },
};
