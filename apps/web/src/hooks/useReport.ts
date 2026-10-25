import { useState } from 'react';
import type { ReportDetail, ReportUpdate } from '@mmt/contracts';
import { isReportRevisionConflict, reportsApi } from '../api/reports';
import { reportRevisionChanges } from '../lib/reportRevisionChanges';
import { useQuery } from './useQuery';
import { useFailureMessage } from './useFailureMessage';

/**
 * レポートの1つのバージョン（`revision`がundefinedなら現在のもの）と、それと一緒に保存した
 * スナップショット。スナップショットは、ブロックが必要とするときだけ読む。
 */
export function useReportDetail(projectId: string, reportId: string, revision: number | undefined) {
  const document = useQuery({ key: `${projectId}:report:${reportId}:${revision ?? 'current'}`, load: (signal) =>
    reportsApi.get(projectId, reportId, { revision, signal }),
  });
  const shownRevision = document.value?.revision;
  const hasSnapshotBlocks = shownRevision?.blocks.some((block) => block.type !== 'markdown' && block.mode === 'snapshot');
  const snapshots = useQuery({
    key: shownRevision && hasSnapshotBlocks ? `${projectId}:report-snapshots:${reportId}:${shownRevision.revision}` : null,
    load: (signal) => reportsApi.snapshots(projectId, reportId, shownRevision!.revision, signal),
  });
  return { document, snapshots };
}

export function useReportRevisions(projectId: string, reportId: string, currentRevision: number | undefined) {
  // 現在のバージョンをキーにして、保存や復元をしたら新しいバージョンが一覧に出るようにする。
  return useQuery({ key: currentRevision === undefined ? null : `${projectId}:report-revisions:${reportId}:${currentRevision}`, load: (signal) =>
    reportsApi.revisions(projectId, reportId, signal),
  });
}

/** `revision`がその前のバージョンから変えた内容。nullなら何も読まない。 */
export function useReportRevisionChanges(projectId: string, reportId: string, revision: number | null) {
  return useQuery({ key: revision === null ? null : `${projectId}:report-revision-changes:${reportId}:${revision}`, load: async (signal) => {
    const [previous, current] = await Promise.all([
      reportsApi.get(projectId, reportId, { revision: revision! - 1, signal }),
      reportsApi.get(projectId, reportId, { revision: revision!, signal }),
    ]);
    return reportRevisionChanges(previous.revision, current.revision);
  } });
}

export type ReportSaveOutcome =
  | { kind: 'saved'; document: ReportDetail }
  | { kind: 'conflict' }
  | { kind: 'failed' };

/**
 * 編集を、それを始めたバージョンの上に保存する。409 report_revision_conflictはほかの失敗と分けて
 * 持つ。これはほかの人が先に保存したことを表し、編集でそれを上書きしてはいけない。
 */
export function useReportSave(projectId: string, reportId: string) {
  const [pending, setPending] = useState(false);
  const { message: error, setFailure, clearFailure } = useFailureMessage();
  const [hasConflict, setHasConflict] = useState(false);

  async function run(operation: () => Promise<ReportDetail>): Promise<ReportSaveOutcome> {
    setPending(true);
    clearFailure();
    setHasConflict(false);
    try {
      return { kind: 'saved', document: await operation() };
    } catch (failure) {
      if (isReportRevisionConflict(failure)) {
        setHasConflict(true);
        return { kind: 'conflict' };
      }
      setFailure(failure);
      return { kind: 'failed' };
    } finally {
      setPending(false);
    }
  }

  return {
    pending,
    error,
    hasConflict,
    save: (input: ReportUpdate) => run(() => reportsApi.update(projectId, reportId, input)),
  };
}
