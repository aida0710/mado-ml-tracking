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
 * レポートのバージョンを新しい順に並べる。過去のバージョンは読み取り専用で開く。復元はその
 * バージョンを新しいバージョンに写すので、履歴を書き換えることは無い。各バージョンは1つ前からの
 * 変更を出せ、そのバージョンを指し続けるリンクを持つ。
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
  /** 読み手が編集できないときは無い。 */
  onRestore?: (revision: ReportRevisionSummary) => void;
  /** バージョンを開くリンク。ほかの人に送るためのもの。 */
  revisionUrl: (revision: number) => string;
}) {
  useLocale();
  const revisions = useReportRevisions(projectId, reportId, currentRevision);
  const changesIdPrefix = useId();
  // 要約は一度に1つだけ。それぞれ2つのバージョンを読むため。
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
                    {item.revision === currentRevision && <span className="status-badge status-accent">{text.reportHistoryCurrent}</span>}
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
