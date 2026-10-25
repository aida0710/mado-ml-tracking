import type { WorkflowExecutionPage, WorkflowExecutionSummary } from '@mmt/contracts';
import { ChoiceField } from '../ChoiceField';
import { Empty } from '../Feedback';
import { formatDate } from '../../lib/format';
import { shortId } from '../../lib/jobDisplay';
import { workflowStatusLabel } from '../../lib/workflowLabels';
import { joinLabels } from '../../i18n/textJoining';
import { workflowsText as labels, workflowsTextTemplates } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

/** ページの実行の一覧。選んだ実行が別のページにあるときは、それを先頭に置く。 */
function withChosen(
  items: WorkflowExecutionSummary[],
  chosen: WorkflowExecutionSummary | undefined,
): WorkflowExecutionSummary[] {
  return chosen && !items.some((item) => item.id === chosen.id) ? [chosen, ...items] : items;
}

/**
 * 表示する実行と、比べる相手の実行を、履歴の1ページから選ぶ。ページを送っても変わるのは
 * 選択肢だけで、表示中と比較中の実行は選んだまま残る。
 */
export function WorkflowHistoryPicker({
  page,
  isFirstPage,
  shown,
  shownId,
  compared,
  comparedId,
  onShow,
  onCompare,
  onFirstPage,
  onNextPage,
}: {
  page: WorkflowExecutionPage;
  isFirstPage: boolean;
  /** 読み込んだ後の表示中の実行。どのページでも選択肢に残る。 */
  shown: WorkflowExecutionSummary | undefined;
  shownId: string;
  compared: WorkflowExecutionSummary | undefined;
  comparedId: string;
  onShow: (executionId: string) => void;
  onCompare: (executionId: string) => void;
  onFirstPage: () => void;
  onNextPage: (cursor: string) => void;
}) {
  useLocale();
  const { nextCursor } = page;
  if (!page.items.length && isFirstPage) return <Empty>{labels.workflowNoExecutions}</Empty>;
  return (
    <>
      <div className="workflow-toolbar">
        <ChoiceField
          label={labels.workflowExecution}
          value={shownId}
          placeholder={labels.workflowChoose}
          onChange={onShow}
          options={withChosen(page.items, shown).map((item) => ({
            value: item.id,
            label: joinLabels([
              formatDate(item.createdAt),
              workflowsTextTemplates.workflowVersionLabel(item.revision),
              workflowStatusLabel(item.status),
              shortId(item.id),
            ]),
          }))}
        />
        <ChoiceField
          label={labels.workflowCompare}
          value={comparedId}
          placeholder={labels.workflowChoose}
          onChange={onCompare}
          options={[
            { value: '', label: labels.workflowNoComparison },
            ...withChosen(page.items, compared)
              .filter((item) => item.id !== shownId)
              .map((item) => ({
                value: item.id,
                label: joinLabels([
                  formatDate(item.createdAt),
                  workflowsTextTemplates.workflowVersionLabel(item.revision),
                  shortId(item.id),
                ]),
              })),
          ]}
        />
      </div>
      <div className="section-actions">
        {!isFirstPage && (
          <button className="button small" onClick={onFirstPage}>
            {labels.workflowFirstPage}
          </button>
        )}
        {nextCursor && (
          <button className="button small" onClick={() => onNextPage(nextCursor)}>
            {labels.workflowNextPage}
          </button>
        )}
      </div>
    </>
  );
}
