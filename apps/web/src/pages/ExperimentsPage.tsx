import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChartLine, Plus, RefreshCw, Terminal } from 'lucide-react';
import type { Experiment, RunSearchRequest, RunStatus } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useProject } from '../hooks/useProject';
import { useQuery } from '../hooks/useQuery';
import { useRunSearch } from '../hooks/useRunSearch';
import { useMutation } from '../hooks/useMutation';
import { useAuth } from '../hooks/useAuth';
import { useRunListSavedView } from '../hooks/useRunListSavedView';
import { ChartPanelLayoutSourceContext } from '../hooks/useChartPanelLayout';
import { PageHeader } from '../components/PageHeader';
import { CopyableValue } from '../components/CopyableValue';
import { RecordingConnectionGuide } from '../components/RecordingConnectionGuide';
import { ErrorNotice, Resource } from '../components/Feedback';
import { FormDialog } from '../components/FormDialog';
import { ExperimentSidebar } from '../components/runs/ExperimentSidebar';
import { RunToolbar } from '../components/runs/RunToolbar';
import { RunTable } from '../components/runs/RunTable';
import { RunSelectionBar } from '../components/runs/RunSelectionBar';
import { RunPagination } from '../components/runs/RunPagination';
import { SavedViewsMenu } from '../components/runs/SavedViewsMenu';
import { getRunColumnNames } from '../components/runs/runColumnNames';
import { RunListCharts } from '../components/charts/RunListCharts';
import { RunDialog } from '../dialogs/RunDialog';
import { ExperimentDialog } from '../dialogs/ExperimentDialog';
import { getFieldValue } from '../lib/formValues';
import { downloadBlob } from '../lib/fileDownload';
import { runSortOrderBy, toRunSearchConditions } from '../lib/runFilter';
import { recordedRunCount, withCreatedExperiment } from '../lib/experimentList';
import { runListEmptyMessage } from '../lib/runListEmptyMessage';
import { getRunChartKeys } from '../lib/runChartKeys';
import {
  defaultRunColumns,
  metricColumn,
  parameterColumn,
  RUN_BASE_COLUMNS,
  RUN_DESCRIPTION_COLUMN,
  tagColumn,
  toggleColumn,
} from '../lib/runColumns';
import {
  CHARTS_OPEN,
  formatRunKinds,
  readRunListConditions,
  RUN_LIST_PARAMS,
  savedViewUrl,
} from '../lib/runListUrl';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

// 1ページを小さくし、幅の広いパラメータやメトリクスの列をノートPCでも使えるようにする。
const RUNS_PER_PAGE = 25;
// 表示中のページまでたどったcursorを古い順に持つURLのパラメータ。cursorはbase64urlなので、
// 中にカンマは現れない。
const CURSOR_HISTORY_PARAM = 'cursors';
const CURSOR_SEPARATOR = ',';

export function ExperimentsPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const listConditions = readRunListConditions(params);
  const { experimentId, searchText, status, kinds, sort } = listConditions;
  const kindsParam = formatRunKinds(kinds);
  const isChartsOpen = params.get(RUN_LIST_PARAMS.charts) === CHARTS_OPEN;
  const cursorHistory = (params.get(CURSOR_HISTORY_PARAM) ?? '')
    .split(CURSOR_SEPARATOR)
    .filter(Boolean);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'experiment' | 'run' | 'tag' | null>(null);
  // ガイドのボタンが押されるまではnull。それまで、ガイドはRunがあるかどうかに従う。
  const [recordingGuideChoice, setRecordingGuideChoice] = useState<boolean | null>(null);
  // 作ったばかりの実験。一覧の読み直しが届く前に選ばれるので、それまでRunの数（0件）をここから読む。
  const [createdExperiment, setCreatedExperiment] = useState<Experiment | null>(null);
  const mutation = useMutation();
  const csvExport = useMutation();
  const [isExportTruncated, setIsExportTruncated] = useState(false);
  // 検索の条件が変わると出るRunも変わるので、選択を空に戻す。
  const selectionConditions = JSON.stringify([experimentId, searchText, status, kindsParam]);
  const [selectedForConditions, setSelectedForConditions] = useState(selectionConditions);
  if (selectedForConditions !== selectionConditions) {
    setSelectedForConditions(selectionConditions);
    setSelectedIds([]);
  }
  const experiments = useQuery({ key: `${project.id}:experiments`, load: (signal) =>
    trackingApi.experiments(project.id, signal),
  });
  const cursor = cursorHistory.at(-1);
  const search: RunSearchRequest = {
    ...toRunSearchConditions(searchText),
    ...(experimentId ? { experimentIds: [experimentId] } : {}),
    ...(status ? { statuses: [status as RunStatus] } : {}),
    ...(kinds.length ? { kinds } : {}),
    orderBy: runSortOrderBy(sort),
    limit: RUNS_PER_PAGE,
    ...(cursor ? { cursor } : {}),
  };
  const { runs, filterRejection } = useRunSearch(project.id, search);
  const { limit: _limit, cursor: _cursor, ...searchConditions } = search;
  async function exportSearchCsv() {
    setIsExportTruncated(false);
    // 書き出しは検索全体が対象。ページ送りの項目は、どのみちAPIが無視する。
    const exported = await csvExport.run(() =>
      trackingApi.exportRunSearchCsv(project.id, searchConditions),
    );
    if (!exported) return;
    downloadBlob(exported.blob, exported.fileName);
    setIsExportTruncated(exported.truncated);
  }
  const experiment = experiments.value?.find((item) => item.id === experimentId);
  // まだ何も記録していなければ、次にやることはSDKからの記録なので、ガイドを開いた状態で始める。
  const isRecordingGuideOpen =
    recordingGuideChoice ??
    recordedRunCount(withCreatedExperiment(experiments.value, createdExperiment), experimentId) === 0;
  const hasNoExperiments = experiments.value?.length === 0;
  const shownRuns = runs.value?.items ?? [];
  const { metricNames, parameterNames } = getRunColumnNames(shownRuns);
  const savedView = useRunListSavedView({
    projectId: project.id,
    conditions: listConditions,
    defaultColumns: defaultRunColumns(metricNames, parameterNames),
  });
  const { columns } = savedView;
  // 保存ビューの列は、このページのどのRunにも無くても選べるようにしておく。
  const columnNames = [
    ...new Set([
      ...RUN_BASE_COLUMNS,
      RUN_DESCRIPTION_COLUMN,
      ...metricNames.map(metricColumn),
      ...parameterNames.map(parameterColumn),
      ...getRunChartKeys(shownRuns).tagKeys.map(tagColumn),
      ...columns.map((column) => column.key),
    ]),
  ];
  const isColumnVisible = (name: string) => columns.some((column) => column.key === name);
  // 条件を変えたら最初のページからやり直す。cursorは1つの検索のものだから。
  function updateParams(updates: Record<string, string>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!(CURSOR_HISTORY_PARAM in updates) && !(RUN_LIST_PARAMS.charts in updates))
        next.delete(CURSOR_HISTORY_PARAM);
      return next;
    });
  }
  const showCursorHistory = (history: string[]) =>
    updateParams({ [CURSOR_HISTORY_PARAM]: history.join(CURSOR_SEPARATOR) });
  function reload() {
    experiments.reload();
    runs.reload();
  }

  return (
    <div className="experiments-layout">
      <ExperimentSidebar
        experiments={experiments}
        selectedExperimentId={experimentId}
        canEdit={canEdit}
        onSelect={(id) => updateParams({ experiment: id })}
        onCreate={() => setDialog('experiment')}
      />
      <section className="page runs-page">
        <PageHeader
          title={experiment?.name ?? text.allExperiments}
          eyebrow={project.name}
          description={
            experiment ? (
              <CopyableValue label={text.experimentId} value={experiment.id} />
            ) : (
              project.description
            )
          }
          actions={
            <>
              <button
                type="button"
                className="button"
                aria-expanded={isRecordingGuideOpen}
                onClick={() => setRecordingGuideChoice(!isRecordingGuideOpen)}
              >
                <Terminal size={15} />
                {text.recordingGuideToggle}
              </button>
              {/* RunにはExperimentが要るので、Experimentの無いProjectはそれを作るところから始める。 */}
              {canEdit && hasNoExperiments && (
                <button className="button primary" onClick={() => setDialog('experiment')}>
                  <Plus size={15} />
                  {text.newFirstExperiment}
                </button>
              )}
              {canEdit && experiments.value && !hasNoExperiments && (
                <button className="button" onClick={() => setDialog('run')}>
                  <Plus size={15} />
                  {text.newRun}
                </button>
              )}
              <button className="icon-button" onClick={reload} aria-label={text.refresh}>
                <RefreshCw size={17} />
              </button>
            </>
          }
        />
        {isRecordingGuideOpen && <RecordingConnectionGuide experiment={experiment} />}
        <SavedViewsMenu
          projectId={project.id}
          actor={{ userId: user.id, role: project.role }}
          views={savedView.views}
          activeView={savedView.activeView}
          hasUnsavedChanges={savedView.isChanged}
          readCurrentState={savedView.readCurrentState}
          viewUrl={(viewId) => savedViewUrl(window.location.origin, project.id, viewId)}
          onOpen={savedView.openView}
          onSaved={savedView.finishSave}
          onDeleted={() => savedView.openView(null)}
        />
        {savedView.notice && (
          <p className="notice" role="status">
            {savedView.notice}
          </p>
        )}
        <ErrorNotice message={savedView.openError} />
        <RunToolbar
          searchText={searchText}
          status={status}
          kinds={kinds}
          sort={sort}
          metricNames={metricNames}
          columnNames={columnNames}
          isColumnVisible={isColumnVisible}
          filterRejection={filterRejection}
          onSearch={(value) => updateParams({ q: value })}
          onStatusChange={(value) => updateParams({ status: value })}
          onKindsChange={(value) => updateParams({ [RUN_LIST_PARAMS.kinds]: formatRunKinds(value) })}
          onSortChange={(value) => updateParams({ sort: value })}
          onColumnToggle={(name) => savedView.setColumns(toggleColumn(columns, name))}
          exportingCsv={csvExport.pending}
          onExportCsv={() => void exportSearchCsv()}
        />
        <div className="section-actions run-chart-toggle">
          <button
            type="button"
            className="button small"
            aria-expanded={isChartsOpen}
            onClick={() => updateParams({ [RUN_LIST_PARAMS.charts]: isChartsOpen ? '' : CHARTS_OPEN })}
          >
            <ChartLine size={14} />
            {isChartsOpen ? text.hideCharts : text.showCharts}
          </button>
        </div>
        {isChartsOpen && (
          <ChartPanelLayoutSourceContext.Provider value={savedView.chartLayoutSource}>
            <RunListCharts
              projectId={project.id}
              conditions={searchConditions}
              selectedIds={selectedIds}
              pageRuns={shownRuns}
            />
          </ChartPanelLayoutSourceContext.Provider>
        )}
        <ErrorNotice message={mutation.error} />
        <ErrorNotice message={csvExport.error} />
        {isExportTruncated && (
          <p className="notice" role="status">
            {text.exportRunsTruncated}
          </p>
        )}
        <Resource query={runs}>
          {(page) => (
            <>
              <RunSelectionBar
                projectId={project.id}
                selectedIds={selectedIds}
                canEdit={canEdit}
                onAddTag={() => setDialog('tag')}
                onClear={() => setSelectedIds([])}
              />
              <RunTable
                projectId={project.id}
                runs={page.items}
                columns={columns}
                onColumnsChange={savedView.setColumns}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                empty={runListEmptyMessage({
                  isNarrowed: Boolean(searchText || status || kinds.length || cursorHistory.length),
                  experimentCount: experiments.value?.length,
                  isExperimentChosen: Boolean(experiment),
                  canEdit,
                })}
              />
              <RunPagination
                pageNumber={cursorHistory.length + 1}
                shownCount={page.items.length}
                pageSize={RUNS_PER_PAGE}
                hasNextPage={page.nextCursor !== null}
                onFirst={() => showCursorHistory([])}
                onPrevious={() => showCursorHistory(cursorHistory.slice(0, -1))}
                onNext={() =>
                  page.nextCursor && showCursorHistory([...cursorHistory, page.nextCursor])
                }
              />
            </>
          )}
        </Resource>
      </section>
      {dialog === 'experiment' && (
        <ExperimentDialog
          projectId={project.id}
          experiments={experiments.value}
          onClose={() => setDialog(null)}
          onCreated={(created) => {
            setDialog(null);
            setCreatedExperiment(created);
            reload();
            updateParams({ experiment: created.id });
          }}
          onOpenExisting={(existing) => {
            setDialog(null);
            updateParams({ experiment: existing.id });
          }}
        />
      )}
      {dialog === 'run' && (
        <RunDialog
          experimentId={experimentId}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            navigate(`/projects/${project.id}/runs/${saved.id}`);
          }}
        />
      )}
      {dialog === 'tag' && (
        <FormDialog
          title={text.addTag}
          fields={[
            { name: 'key', label: text.tagKey, required: true },
            { name: 'value', label: text.tagValue, required: true },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            // マージの前に今のタグを読み、ポーリングで得た古い状態でほかの編集を消さないようにする。
            for (const id of selectedIds) {
              const run = await trackingApi.run(project.id, id);
              await trackingApi.updateRun(project.id, id, {
                tags: {
                  ...run.tags,
                  [getFieldValue(values, 'key')]: getFieldValue(values, 'value'),
                },
              });
            }
            return true;
          }}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
