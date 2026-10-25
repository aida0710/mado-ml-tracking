import { useCallback } from 'react';
import type { ComputeTarget } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { computerNameOf } from '../lib/computerNames';
import { useQuery } from './useQuery';
import { text } from '../i18n/catalog';

const NO_KNOWN_COMPUTERS: readonly Pick<ComputeTarget, 'id' | 'name'>[] = [];

/**
 * Job・array・Task・フック・自動実行ルールの表と詳細で使う、idからのコンピュータ名。`known`は
 * 画面が既に持っているコンピュータ（Projectで使えるもの）。今はほかの人のPrivateになった
 * コンピュータはその中に無いが、名前は公開されている（全体設定 → コンピュータ）ので、
 * GET /targets/overviewから取る。表ごとに1回呼んで引き方を行に渡し、一覧を行ごとでなく1回だけ読む。
 */
export function useComputerNames(
  known: readonly Pick<ComputeTarget, 'id' | 'name'>[] = NO_KNOWN_COMPUTERS,
): (targetId: string) => string {
  const overview = useQuery({ key: 'compute-target-overview', load: executionApi.targetOverview });
  const computers = overview.value;
  return useCallback(
    (targetId: string) => computerNameOf({ known, computers, targetId, deletedLabel: text.computerDeleted }),
    [known, computers],
  );
}
