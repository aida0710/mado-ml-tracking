import { useState } from 'react';
import { MAX_RUN_LOG_TAIL } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * ログの画面がポーリングする行数。失敗とそのtracebackを読むには足り、数秒ごとに取得できるほど
 * 小さい（3,000行で約450KBだった）。それより古い行は求めたときに読む。
 */
export const RUN_LOG_TAIL_LINES = 2000;

/**
 * JobsのページとRunのLogsタブで出すRunのログ。最新の行を出し、Runがまだ書き込める間（`isLive`）は
 * 数秒ごとに読み直す。終わったRunのログは1回だけ読む。求められたら、1回の読み込みで返る最大の
 * 行数（MAX_RUN_LOG_TAIL）の最新の行を1回だけ読む。その行数をポーリングすると、数秒ごとに
 * メガバイト単位で取得してしまう。すべての行はダウンロードのリンクにある。
 */
export function useRunLogs({
  projectId,
  run,
  enabled,
  isLive,
}: {
  projectId: string;
  run: { id: string } | undefined;
  enabled: boolean;
  isLive: boolean;
}) {
  // Runごとに覚えるので、別のJobを選ぶと、また最新の行から始まる。
  const [moreLinesRunId, setMoreLinesRunId] = useState<string | null>(null);
  const runId = run?.id;
  const readsMoreLines = runId !== undefined && moreLinesRunId === runId;
  const lines = useQuery({
    key: enabled && runId ? `${projectId}:${runId}:logs:${readsMoreLines ? 'more' : 'latest'}` : null,
    load: (signal) =>
      trackingApi.logs(projectId, runId!, {
        tail: readsMoreLines ? MAX_RUN_LOG_TAIL : RUN_LOG_TAIL_LINES,
        signal,
      }),
    // ポーリングをやめるときにもう1回読み、Runが終わるときに書いた行も出す。
    pollMs: isLive && !readsMoreLines ? EXECUTION_POLL_MS : undefined,
  });
  return {
    lines,
    isLive,
    readsMoreLines,
    readMoreLines: () => setMoreLinesRunId(runId ?? null),
    /** 最新の行に戻る。Runが動いている間は数秒ごとに読み直す。 */
    followLatestLines: () => setMoreLinesRunId(null),
    downloadUrl: runId ? trackingApi.runLogFileUrl(projectId, runId) : undefined,
  };
}

export type RunLogsState = ReturnType<typeof useRunLogs>;
