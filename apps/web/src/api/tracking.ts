import { fetchResponse, isNotFoundError, jsonRequestInit, requestJson } from '@mado/design-system/http';
import type {
  Artifact,
  ArtifactListVersions,
  RunComparisonRequest,
  RunLogList,
  RunSearchRequest,
} from '@mmt/contracts';
import { RUN_EXPORT_TRUNCATED_HEADER } from '@mmt/contracts';
import {
  artifactPageSchema,
  artifactSchema,
  artifactTreeSchema,
  experimentSchema,
  itemsOf,
  lineageGraphSchema,
  metricPointSchema,
  runComparisonSchema,
  runLogListSchema,
  runSchema,
  runSearchPageSchema,
} from '@mmt/contracts/schemas';
import type { CreateRun, UpdateRun } from './inputs';
import { encodeId, projectPath } from './http';

const artifactContentPath = (projectId: string, artifactId: string) =>
  `${projectPath(projectId)}/artifacts/${encodeId(artifactId)}/content`;

const runPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}`;

export interface RunArtifactPageQuery {
  prefix?: string;
  /** prefixの直下のファイルだけ（APIの`delimiter=/`）。 */
  directFilesOnly?: boolean;
  versions?: ArtifactListVersions;
  limit?: number;
  cursor?: string;
}

export interface ProjectArtifactPageQuery {
  limit: number;
  query?: string;
  /** `type/subtype`か`type/*`。 */
  mimeType?: string;
  runId?: string;
  modelVersionId?: string;
  /** モデルのすべてのバージョン。modelVersionIdも指定すると、そのバージョンだけ。 */
  modelId?: string;
  versions?: ArtifactListVersions;
  cursor?: string;
}

/** 指定の無い値を落とし、APIに自分の既定値を使わせる。 */
function searchParams(values: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(values).filter(
    (entry): entry is [string, string | number | true] =>
      entry[1] !== undefined && entry[1] !== '' && entry[1] !== false,
  );
  return new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
}

function runArtifactPage(projectId: string, runId: string, query: RunArtifactPageQuery, signal?: AbortSignal) {
  const { directFilesOnly, ...rest } = query;
  return requestJson(
    `${runPath(projectId, runId)}/artifacts?${searchParams({
      ...rest,
      delimiter: directFilesOnly ? '/' : undefined,
    })}`,
    { schema: artifactPageSchema, init: { signal } },
  );
}

function projectArtifactPage(projectId: string, query: ProjectArtifactPageQuery, signal?: AbortSignal) {
  return requestJson(`${projectPath(projectId)}/artifacts?${searchParams({ ...query })}`, {
    schema: artifactPageSchema,
    init: { signal },
  });
}
export interface RunSearchCsv {
  blob: Blob;
  fileName: string;
  /** 一致したRunが書き出しの上限より多い。ファイルの最後に、それを知らせる行が付く。 */
  truncated: boolean;
}

// Content-Dispositionが無いか読めないときに使う。
const FALLBACK_EXPORT_FILE_NAME = 'runs.csv';

function attachmentFileName(disposition: string | null): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // エスケープが壊れていれば、ASCIIの名前を読む処理へ進む。
    }
  }
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? FALLBACK_EXPORT_FILE_NAME;
}

/** 検索結果のCSVはPOSTなので、リンクとしてたどらずにblobとして読む。 */
async function exportRunSearchCsv(
  projectId: string,
  search: RunSearchRequest,
  signal?: AbortSignal,
): Promise<RunSearchCsv> {
  const response = await fetchResponse(`${projectPath(projectId)}/runs/search/export.csv`, {
    init: { ...jsonRequestInit('POST', search), signal },
  });
  return {
    blob: await response.blob(),
    fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    truncated: response.headers.get(RUN_EXPORT_TRUNCATED_HEADER) === 'true',
  };
}

export const trackingApi = {
  experiments: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/experiments`, {
        schema: itemsOf(experimentSchema),
        init: { signal },
      })
    ).items,
  createExperiment: (projectId: string, body: { name: string; description?: string }) =>
    requestJson(`${projectPath(projectId)}/experiments`, {
      schema: experimentSchema,
      init: jsonRequestInit('POST', body),
    }),
  searchRuns: (projectId: string, body: RunSearchRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/runs/search`, {
      schema: runSearchPageSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  exportRunSearchCsv,
  compareRuns: (projectId: string, body: RunComparisonRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/runs/compare`, {
      schema: runComparisonSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  /** ブラウザがsessionのcookieを付けてダウンロードするGETのリンク。 */
  runComparisonCsvUrl: (
    projectId: string,
    comparison: { runIds: string[]; baselineRunId: string | null },
  ) =>
    `${projectPath(projectId)}/runs/compare.csv?${searchParams({
      runIds: comparison.runIds.join(','),
      baselineRunId: comparison.baselineRunId ?? undefined,
    })}`,
  run: (projectId: string, runId: string, signal?: AbortSignal) =>
    requestJson(runPath(projectId, runId), { schema: runSchema, init: { signal } }),
  createRun: (projectId: string, body: CreateRun) =>
    requestJson(`${projectPath(projectId)}/runs`, { schema: runSchema, init: jsonRequestInit('POST', body) }),
  updateRun: (projectId: string, runId: string, body: UpdateRun) =>
    requestJson(runPath(projectId, runId), { schema: runSchema, init: jsonRequestInit('PATCH', body) }),
  metrics: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${runPath(projectId, runId)}/metrics`, {
        schema: itemsOf(metricPointSchema),
        init: { signal },
      })
    ).items,
  /** Runのログの行を古い順に返す。`tail`を付けると最新のその行数だけ（RunLogList）。 */
  logs: (
    projectId: string,
    runId: string,
    query: { tail?: number; signal?: AbortSignal } = {},
  ): Promise<RunLogList> => {
    const search = query.tail ? `?${new URLSearchParams({ tail: String(query.tail) })}` : '';
    return requestJson(`${runPath(projectId, runId)}/logs${search}`, {
      schema: runLogListSchema,
      init: { signal: query.signal },
    });
  },
  /** ブラウザがsessionのcookieを付けてダウンロードするGETのリンク。全行を`<Run name>.log`として落とす。 */
  runLogFileUrl: (projectId: string, runId: string) => `${runPath(projectId, runId)}/logs/download`,
  /** Runの最新のArtifactを、全ページたどってすべて返す。一覧の画面はrunArtifactPageでページ送りする。 */
  artifacts: async (projectId: string, runId: string, signal?: AbortSignal) => {
    const items: Artifact[] = [];
    let cursor: string | undefined;
    do {
      const page = await runArtifactPage(projectId, runId, { cursor }, signal);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  },
  runArtifactPage,
  runArtifactTree: (projectId: string, runId: string, prefix: string, signal?: AbortSignal) =>
    requestJson(`${runPath(projectId, runId)}/artifacts/tree?${searchParams({ prefix })}`, {
      schema: artifactTreeSchema,
      init: { signal },
    }),
  projectArtifacts: async (
    projectId: string,
    query: Pick<ProjectArtifactPageQuery, 'limit' | 'query' | 'runId' | 'versions'>,
    signal?: AbortSignal,
  ) => (await projectArtifactPage(projectId, query, signal)).items,
  projectArtifactPage,
  artifactUrl: (projectId: string, artifactId: string) => artifactContentPath(projectId, artifactId),
  artifactText: async (projectId: string, artifactId: string, signal?: AbortSignal) =>
    (await fetchResponse(artifactContentPath(projectId, artifactId), { init: { signal } })).text(),
  artifact: (projectId: string, artifactId: string, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}`, {
      schema: artifactSchema,
      init: { signal },
    }),
  /** ProjectにそのidのArtifactが無ければnull（削除済み、別のProjectのもの、打ち間違い）。 */
  findArtifact: async (projectId: string, artifactId: string, signal?: AbortSignal) => {
    try {
      return await trackingApi.artifact(projectId, artifactId, signal);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  },
  lineage: (projectId: string, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/lineage`, { schema: lineageGraphSchema, init: { signal } }),
};
