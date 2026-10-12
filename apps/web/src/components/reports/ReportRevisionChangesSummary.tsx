import { Resource } from '../Feedback';
import { useReportRevisionChanges } from '../../hooks/useReport';
import { hasRevisionChanges, type BlockTypeCount } from '../../lib/reportRevisionChanges';
import { useLocale } from '../../i18n/useLocale';
import { reportBlockTypeLabels } from '../../i18n/reports';
import { text, textTemplates } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

const blockCountsLabel = (counts: readonly BlockTypeCount[]) =>
  formatList(counts.map(({ type, count }) => textTemplates.reportBlockCount(reportBlockTypeLabels[type], count)));

/** What a revision changed from the one before it: the title, and blocks added, removed, edited or moved. */
export function ReportRevisionChangesSummary({
  projectId,
  reportId,
  revision,
  id,
}: {
  projectId: string;
  reportId: string;
  revision: number;
  /** Lets the button that opens the summary point at it (aria-controls). */
  id: string;
}) {
  useLocale();
  const changes = useReportRevisionChanges(projectId, reportId, revision);
  return (
    <div id={id} className="report-history-changes">
      <Resource query={changes}>
        {(value) =>
          !hasRevisionChanges(value) ? (
            <p className="muted">{text.reportChangesNone}</p>
          ) : (
            <ul>
              {value.isTitleChanged && <li>{text.reportChangesTitle}</li>}
              {value.added.length > 0 && <li>{textTemplates.reportChangesAdded(blockCountsLabel(value.added))}</li>}
              {value.edited.length > 0 && <li>{textTemplates.reportChangesEdited(blockCountsLabel(value.edited))}</li>}
              {value.removed.length > 0 && <li>{textTemplates.reportChangesRemoved(blockCountsLabel(value.removed))}</li>}
              {value.isReordered && <li>{text.reportChangesReordered}</li>}
            </ul>
          )
        }
      </Resource>
    </div>
  );
}
