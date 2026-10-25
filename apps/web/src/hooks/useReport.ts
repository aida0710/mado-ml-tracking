import { useState } from 'react';
import type { ReportDetail, ReportUpdate } from '@mmt/contracts';
import { isReportRevisionConflict, reportsApi } from '../api/reports';
import { reportRevisionChanges } from '../lib/reportRevisionChanges';
import { useQuery } from './useQuery';
import { useFailureMessage } from './useFailureMessage';

/**
 * One revision of a report (the current one when `revision` is undefined) and the snapshots stored
 * with it. Snapshots are read only when a block needs them.
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
  // Keyed by the current revision so a save or restore lists the new revision.
  return useQuery({ key: currentRevision === undefined ? null : `${projectId}:report-revisions:${reportId}:${currentRevision}`, load: (signal) =>
    reportsApi.revisions(projectId, reportId, signal),
  });
}

/** What `revision` changed from the revision before it; null reads nothing. */
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
 * Saves an edit on top of the revision it started from. A 409 report_revision_conflict is kept
 * apart from other failures: someone else saved first, and the edit must not overwrite it.
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
