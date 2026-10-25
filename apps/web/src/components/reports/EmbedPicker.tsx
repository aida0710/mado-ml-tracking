import { useId, useState } from 'react';
import {
  REPORT_RUN_TABLE_MAX_ROWS,
  type ReportEmbedBlock,
  type ReportEmbedMode,
  type ReportRunSet,
} from '@mmt/contracts';
import { Dialog } from '../Dialog';
import { ChartPanelEditor } from '../charts/ChartPanelEditor';
import { RunChecklist, RunSetPicker } from './RunSetPicker';
import { MediaEmbedFields } from './MediaEmbedFields';
import { NameSelect } from './NameSelect';
import { ErrorNotice, Loading } from '../Feedback';
import { useRunSetFieldNames, useRunTableMedia } from '../../hooks/useReportBlockData';
import { createBlock, reportBlockProblem } from '../../lib/reportBlocks';
import { metricFieldKey, paramFieldKey } from '../../lib/runAnalysisFields';
import { useLocale } from '../../i18n/useLocale';
import {
  reportBlockProblemLabels,
  reportBlockTypeLabels,
  reportEmbedModeLabels,
} from '../../i18n/reports';
import { text, textTemplates } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

type EmbedType = ReportEmbedBlock['type'];
const EMBED_TYPES: EmbedType[] = [
  'chart',
  'parallel_coordinates',
  'parameter_importance',
  'scatter',
  'run_table',
  'media',
  'media_table',
];
// メトリクスとパラメータ以外のRunの一覧の列。名前は常に出す（components/runs/RunTable）。
const getRunTableBaseColumns = (): Array<[string, string]> => [
  ['status', text.status],
  ['created', text.created],
  ['duration', text.duration],
  ['user', text.user],
  ['kind', text.kind],
];
// 図の編集画面の表示だけの設定はレポートに保存しない。レポートでは既定の値で描く。
const CHART_VIEW_SETTINGS = { xScale: 'linear', showRaw: true } as const;

/** 1つの埋め込みを設定する。種類、Run、何を描くか、データを固定するかどうか。 */
export function EmbedPicker({
  projectId,
  initial,
  isNew,
  onApply,
  onClose,
}: {
  projectId: string;
  initial: ReportEmbedBlock;
  isNew: boolean;
  onApply: (block: ReportEmbedBlock) => void;
  onClose: () => void;
}) {
  useLocale();
  const id = useId();
  const [block, setBlock] = useState<ReportEmbedBlock>(initial);
  const problem = reportBlockProblem(block);

  function changeType(type: EmbedType) {
    // 選んだRunとモードは残す。それ以外は前の種類のもの。
    const runSet = 'runSet' in block ? block.runSet : undefined;
    const next = createBlock(type, block.id, runSet) as ReportEmbedBlock;
    setBlock({ ...next, mode: block.mode });
  }
  function changeRunSet(runSet: ReportRunSet) {
    if ('runSet' in block) setBlock({ ...block, runSet });
  }

  return (
    <Dialog
      title={isNew ? text.reportEmbedTitleNew : text.reportEmbedTitleEdit}
      onClose={onClose}
      size="wide"
      className="report-embed-picker"
    >
      {/* フォームにしない。ここから開く図の編集画面にもフォームがあり、入れ子のフォームは
          ブラウザがページごと送信する。 */}
      <div className="report-embed-picker-body">
        <label className="field">
          <span>{text.reportEmbedType}</span>
          <select
            aria-label={text.reportEmbedType}
            value={block.type}
            onChange={(event) => changeType(event.target.value as EmbedType)}
          >
            {EMBED_TYPES.map((type) => (
              <option key={type} value={type}>
                {reportBlockTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        {'runSet' in block && <RunSetPicker projectId={projectId} runSet={block.runSet} onChange={changeRunSet} />}
        <EmbedFields projectId={projectId} block={block} onChange={setBlock} />
        <fieldset className="report-mode-field">
          <legend>{text.reportModeLabel}</legend>
          <div className="report-segmented" role="radiogroup" aria-label={text.reportModeLabel}>
            {(Object.keys(reportEmbedModeLabels) as ReportEmbedMode[]).map((mode) => (
              <label key={mode} className={block.mode === mode ? 'active' : ''}>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={block.mode === mode}
                  onChange={() => setBlock({ ...block, mode })}
                />
                {reportEmbedModeLabels[mode]}
              </label>
            ))}
          </div>
        </fieldset>
        {problem && <p className="report-block-problem">{reportBlockProblemLabels[problem]}</p>}
        <footer>
          <button type="button" className="button" onClick={onClose}>
            {text.cancel}
          </button>
          <button type="button" className="button primary" disabled={problem !== null} onClick={() => onApply(block)}>
            {text.reportEmbedApply}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}

/** 選んだ種類の設定。 */
function EmbedFields({
  projectId,
  block,
  onChange,
}: {
  projectId: string;
  block: ReportEmbedBlock;
  onChange: (block: ReportEmbedBlock) => void;
}) {
  useLocale();
  if (block.type === 'media') return <MediaEmbedFields projectId={projectId} block={block} onChange={onChange} />;
  if (block.type === 'media_table') return <MediaTableFields projectId={projectId} block={block} onChange={onChange} />;
  return <RunSetFields projectId={projectId} block={block} onChange={onChange} />;
}

type RunSetBlock = Exclude<ReportEmbedBlock, { type: 'media' | 'media_table' }>;

/** Runの集合が使うメトリクス・パラメータ・タグの名前から選ぶ項目。 */
function RunSetFields({
  projectId,
  block,
  onChange,
}: {
  projectId: string;
  block: RunSetBlock;
  onChange: (block: ReportEmbedBlock) => void;
}) {
  useLocale();
  const [isEditingChart, setEditingChart] = useState(false);
  const hasRuns = reportBlockProblem(block) !== 'runSetEmpty';
  const names = useRunSetFieldNames(projectId, hasRuns ? block.runSet : null);
  if (!hasRuns) return null;
  if (names.error) return <ErrorNotice message={names.error} retry={names.reload} />;
  if (!names.value) return <Loading />;
  const { metricNames, parameterNames, tagKeys } = names.value;
  const analysisFields = [
    ...parameterNames.map((name) => ({ key: paramFieldKey(name), label: `${text.parameters}: ${name}` })),
    ...metricNames.map((name) => ({ key: metricFieldKey(name), label: `${text.metrics}: ${name}` })),
  ];

  switch (block.type) {
    case 'chart':
      return (
        <div className="field">
          <span>{text.reportChartSettings}</span>
          <div className="report-inline-row">
            <span className="mono">
              {textTemplates.reportChartMetrics(formatList(block.panel.metricKeys) || text.reportChartMetricsNone)}
            </span>
            <button type="button" className="button small" onClick={() => setEditingChart(true)}>
              {text.reportChartSettings}
            </button>
          </div>
          {isEditingChart && (
            <ChartPanelEditor
              dialogTitle={text.reportChartSettings}
              initial={{ panel: block.panel, view: CHART_VIEW_SETTINGS }}
              metricKeys={metricNames}
              grouping={{ tagKeys, paramKeys: parameterNames }}
              onClose={() => setEditingChart(false)}
              onSave={(draft) => {
                setEditingChart(false);
                onChange({ ...block, panel: { ...draft.panel, id: block.panel.id, layout: block.panel.layout } });
              }}
            />
          )}
        </div>
      );
    case 'parallel_coordinates':
      return (
        <>
          <fieldset className="report-checklist">
            <legend>{text.reportParallelParams}</legend>
            {parameterNames.map((name) => (
              <label key={name} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={block.params?.includes(name) ?? false}
                  onChange={(event) => {
                    const params = block.params ?? [];
                    onChange({
                      ...block,
                      params: event.target.checked ? [...params, name] : params.filter((param) => param !== name),
                    });
                  }}
                />
                <span className="mono">{name}</span>
              </label>
            ))}
          </fieldset>
          <NameSelect
            label={text.reportMetric}
            value={block.metric}
            options={metricNames.map((name) => ({ key: name, label: name }))}
            onChange={(metric) => onChange({ ...block, metric })}
          />
        </>
      );
    case 'parameter_importance': {
      const isSweep = 'sweepId' in block.runSet;
      return (
        <NameSelect
          label={text.reportImportanceTarget}
          value={block.targetMetric ?? ''}
          noneLabel={isSweep ? text.reportSweepObjective : text.none}
          options={metricNames.map((name) => ({ key: name, label: name }))}
          onChange={(targetMetric) => {
            const { targetMetric: _previous, ...rest } = block;
            onChange(targetMetric ? { ...rest, targetMetric } : rest);
          }}
        />
      );
    }
    case 'scatter':
      return (
        <div className="report-field-grid">
          <NameSelect label={text.reportScatterX} value={block.x} options={analysisFields} onChange={(x) => onChange({ ...block, x })} />
          <NameSelect label={text.reportScatterY} value={block.y} options={analysisFields} onChange={(y) => onChange({ ...block, y })} />
          <NameSelect
            label={text.reportScatterColor}
            value={block.color ?? ''}
            options={analysisFields}
            onChange={(color) => {
              const { color: _previous, ...rest } = block;
              onChange(color ? { ...rest, color } : rest);
            }}
          />
        </div>
      );
    case 'run_table': {
      const columns: Array<[string, string]> = [
        ...getRunTableBaseColumns(),
        ...metricNames.map((name): [string, string] => [metricFieldKey(name), `${text.metrics}: ${name}`]),
        ...parameterNames.map((name): [string, string] => [paramFieldKey(name), `${text.parameters}: ${name}`]),
      ];
      return (
        <>
          <fieldset className="report-checklist">
            <legend>{text.reportRunTableColumns}</legend>
            {columns.map(([key, label]) => (
              <label key={key} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={block.columns.includes(key)}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      columns: event.target.checked ? [...block.columns, key] : block.columns.filter((column) => column !== key),
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>{text.reportRunTableLimit}</span>
            <input
              type="number"
              min={1}
              max={REPORT_RUN_TABLE_MAX_ROWS}
              value={block.limit}
              onChange={(event) =>
                onChange({
                  ...block,
                  limit: Math.max(1, Math.min(REPORT_RUN_TABLE_MAX_ROWS, Math.trunc(Number(event.target.value)) || 1)),
                })
              }
            />
          </label>
        </>
      );
    }
  }
}

function MediaTableFields({
  projectId,
  block,
  onChange,
}: {
  projectId: string;
  block: Extract<ReportEmbedBlock, { type: 'media_table' }>;
  onChange: (block: ReportEmbedBlock) => void;
}) {
  useLocale();
  const tables = useRunTableMedia(projectId, block.runId);
  return (
    <>
      <fieldset className="report-run-set">
        <legend>{text.reportMediaTableRun}</legend>
        <RunChecklist
          projectId={projectId}
          selectedIds={block.runId ? [block.runId] : []}
          maxCount={1}
          mediaKind="table"
          onChange={(runIds) => onChange({ ...block, runId: runIds[0] ?? '', mediaId: '' })}
        />
      </fieldset>
      {block.runId && (
        <>
          <ErrorNotice message={tables.error} retry={tables.reload} />
          <NameSelect
            label={text.reportMediaTable}
            value={block.mediaId}
            noneLabel={tables.value?.length === 0 ? text.reportMediaTableNone : text.none}
            options={(tables.value ?? []).map((media) => ({ key: media.id, label: textTemplates.reportMediaTableOption(media.key, media.step) }))}
            onChange={(mediaId) => onChange({ ...block, mediaId })}
          />
        </>
      )}
    </>
  );
}
