import { useId, useState } from 'react';
import type { ReportRevisionSummary } from '@mmt/contracts';
import { CopyButton } from '../CopyButton';
import { Resource } from '../Feedback';
import { ReportRevisionChangesSummary } from './ReportRevisionChangesSummary';
import { useReportRevisions } from '../../hooks/useReport';
import { formatDate } from '../../lib/format';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { joinLabels } from '../../i18n/textJoining';

/**
 * Revisions of a report, newest first. A past revision opens read-only; restoring copies it into a
 * new revision, so the history is never rewritten. Each revision can say what it changed from the
 * one before, and gives a link that keeps pointing at it.
 */
export function ReportRevisionHistory({
  projectId,
  reportId,
  currentRevision,
  shownRevision,
  onShow,
  onRestore,
  revisionUrl,
}: {
  projectId: string;
  reportId: string;
  currentRevision: number;
  shownRevision: number;
  onShow: (revision: number) => void;
  /** Absent when the reader may not edit. */
  onRestore?: (revision: ReportRevisionSummary) => void;
  /** The link that opens a revision, for sending it to someone. */
  revisionUrl: (revision: number) => string;
}) {
  useLocale();
  const revisions = useReportRevisions(projectId, reportId, currentRevision);
  const changesIdPrefix = useId();
  // One summary at a time: each one reads two revisions.
  const [changesRevision, setChangesRevision] = useState<number | null>(null);
  return (
    <section className="report-history" aria-label={text.reportHistory}>
      <h2>{text.reportHistory}</h2>
      <Resource query={revisions}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted">{text.reportHistoryEmpty}</p>
          ) : (
            <ol className="report-history-list">
              {items.map((item) => (
                <li key={item.revision} className={item.revision === shownRevision ? 'active' : ''}>
                  <div className="report-history-heading">
                    <strong>{textTemplates.reportRevisionLabel(item.revision)}</strong>
                    {item.revision === currentRevision && <span className="report-badge">{text.reportHistoryCurrent}</span>}
                  </div>
                  <div className="muted">
                    {joinLabels([item.createdBy.displayName, formatDate(item.createdAt)])}
                  </div>
                  {item.message && <p className="report-history-message">{item.message}</p>}
                  {item.restoredFromRevision !== null && (
                    <p className="muted">{textTemplates.reportRestoredFrom(item.restoredFromRevision)}</p>
                  )}
                  <div className="report-history-actions">
                    {item.revision === shownRevision ? (
                      <span className="muted">{text.reportHistoryShowing}</span>
                    ) : (
                      <button type="button" className="button small" onClick={() => onShow(item.revision)}>
                        {text.reportHistoryShow}
                      </button>
                    )}
                    <CopyButton value={revisionUrl(item.revision)} label={text.reportCopyRevisionUrl} />
                    {item.revision > 1 && (
                      <button
                        type="button"
                        className="button small"
                        aria-expanded={changesRevision === item.revision}
                        aria-controls={`${changesIdPrefix}-${item.revision}`}
                        onClick={() => setChangesRevision(changesRevision === item.revision ? null : item.revision)}
                      >
                        {text.reportChangesShow}
                      </button>
                    )}
                    {onRestore && item.revision !== currentRevision && (
                      <button type="button" className="button small" onClick={() => onRestore(item)}>
                        {text.reportRestore}
                      </button>
                    )}
                  </div>
                  {changesRevision === item.revision && (
                    <ReportRevisionChangesSummary
                      id={`${changesIdPrefix}-${item.revision}`}
                      projectId={projectId}
                      reportId={reportId}
                      revision={item.revision}
                    />
                  )}
                </li>
              ))}
            </ol>
          )
        }
      </Resource>
    </section>
  );
}
