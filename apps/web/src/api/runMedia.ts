import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { MediaCompareRequest, RunMedia, RunMediaKind } from '@mmt/contracts';
import {
  itemsOf,
  mediaCompareGridSchema,
  mediaTablePageSchema,
  runMediaKeySummarySchema,
  runMediaPageSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

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

/** 最後のページにはnextCursorが無い。 */
function mediaPage(
  projectId: string,
  runId: string,
  query: RunMediaQuery & { cursor?: string; limit: number },
  signal?: AbortSignal,
) {
  return requestJson(`${runMediaPath(projectId, runId)}?${mediaQueryString(query)}`, {
    schema: runMediaPageSchema,
    init: { signal },
  });
}

export const runMediaApi = {
  keys: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${runMediaPath(projectId, runId)}/keys`, {
        schema: itemsOf(runMediaKeySummarySchema),
        init: { signal },
      })
    ).items,
  page: mediaPage,
  /** キーのすべてのメディアをstepの順に返す。cursorはRUN_MEDIA_MAX_ITEMS件までたどる。 */
  list: async (projectId: string, runId: string, query: RunMediaQuery, signal?: AbortSignal): Promise<RunMediaOfKey> => {
    const items: RunMedia[] = [];
    let cursor: string | undefined;
    do {
      const page = await mediaPage(projectId, runId, { ...query, cursor, limit: RUN_MEDIA_PAGE_LIMIT }, signal);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && items.length < RUN_MEDIA_MAX_ITEMS);
    return { items: items.slice(0, RUN_MEDIA_MAX_ITEMS), truncated: cursor !== undefined };
  },
  compare: (projectId: string, body: MediaCompareRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/media/compare`, {
      schema: mediaCompareGridSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  /** このArtifactとして保存した表のメディア。ファイルが記録された表でなければnull。 */
  tableOfArtifact: async (
    projectId: string,
    target: { runId: string; artifactId: string },
    signal?: AbortSignal,
  ): Promise<RunMedia | null> => {
    const parameters = new URLSearchParams({ kind: 'table', artifactId: target.artifactId, limit: '1' });
    const page = await requestJson(`${runMediaPath(projectId, target.runId)}?${parameters}`, {
      schema: runMediaPageSchema,
      init: { signal },
    });
    return page.items[0] ?? null;
  },
  table: (
    projectId: string,
    target: { runId: string; mediaId: string },
    rows: { offset: number; limit: number },
    signal?: AbortSignal,
  ) => {
    const parameters = new URLSearchParams({ offset: String(rows.offset), limit: String(rows.limit) });
    return requestJson(`${runMediaPath(projectId, target.runId)}/${encodeId(target.mediaId)}/table?${parameters}`, {
      schema: mediaTablePageSchema,
      init: { signal },
    });
  },
};
