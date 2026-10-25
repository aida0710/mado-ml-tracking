import { useId, useState } from 'react';
import { REPORT_RUN_SET_MAX_RUN_IDS, type ReportRunSet, type RunMediaKind } from '@mmt/contracts';
import { useRunCandidates, useRunSetSources, useRunsWithMediaKind } from '../../hooks/useReportBlockData';
import { ErrorNotice, Loading } from '../Feedback';
import { RunStatusBadge } from '../runs/RunStatusBadge';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

type RunSetSource = 'runIds' | 'savedViewId' | 'search' | 'sweepId';

const sourceLabels: Record<RunSetSource, string> = {
  get runIds() { return text.reportRunSetSelected; },
  get savedViewId() { return text.reportRunSetSavedView; },
  get search() { return text.reportRunSetSearch; },
  get sweepId() { return text.reportRunSetSweep; },
};

function sourceOf(runSet: ReportRunSet): RunSetSource {
  if ('runIds' in runSet) return 'runIds';
  if ('savedViewId' in runSet) return 'savedViewId';
  if ('search' in runSet) return 'search';
  return 'sweepId';
}

function emptyRunSet(source: RunSetSource): ReportRunSet {
  switch (source) {
    case 'runIds':
      return { runIds: [] };
    case 'savedViewId':
      return { savedViewId: '' };
    case 'search':
      return { search: { filter: '' } };
    case 'sweepId':
      return { sweepId: '' };
  }
}

/** 埋め込みのRunを選ぶ。選んだRun、Projectの保存ビュー、検索、Sweep。 */
export function RunSetPicker({
  projectId,
  runSet,
  onChange,
}: {
  projectId: string;
  runSet: ReportRunSet;
  onChange: (runSet: ReportRunSet) => void;
}) {
  useLocale();
  const id = useId();
  const source = sourceOf(runSet);
  const { savedViews, sweeps } = useRunSetSources(projectId);
  return (
    <fieldset className="report-run-set">
      <legend>{text.reportRunSet}</legend>
      <div className="report-segmented" role="radiogroup" aria-label={text.reportRunSet}>
        {(Object.keys(sourceLabels) as RunSetSource[]).map((item) => (
          <label key={item} className={item === source ? 'active' : ''}>
            <input
              type="radio"
              name={`${id}-source`}
              checked={item === source}
              onChange={() => onChange(emptyRunSet(item))}
            />
            {sourceLabels[item]}
          </label>
        ))}
      </div>
      {'runIds' in runSet && (
        <RunChecklist
          projectId={projectId}
          selectedIds={runSet.runIds}
          maxCount={REPORT_RUN_SET_MAX_RUN_IDS}
          onChange={(runIds) => onChange({ runIds })}
        />
      )}
      {'savedViewId' in runSet && (
        <label className="field">
          <span>{text.reportRunSetSavedView}</span>
          <ErrorNotice message={savedViews.error} retry={savedViews.reload} />
          <select
            aria-label={text.reportRunSetSavedView}
            value={runSet.savedViewId}
            onChange={(event) => onChange({ savedViewId: event.target.value })}
          >
            <option value="">{savedViews.value?.length === 0 ? text.reportRunSetSavedViewNone : text.none}</option>
            {savedViews.value?.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
          <small className="muted">{text.reportRunSetSavedViewHint}</small>
        </label>
      )}
      {'search' in runSet && (
        <label className="field">
          <span>{text.reportRunSetSearch}</span>
          <textarea
            aria-label={text.reportRunSetSearch}
            rows={2}
            value={runSet.search.filter ?? ''}
            onChange={(event) => onChange({ search: { ...runSet.search, filter: event.target.value } })}
          />
          <small className="muted">{text.reportRunSetSearchHint}</small>
        </label>
      )}
      {'sweepId' in runSet && (
        <label className="field">
          <span>{text.reportRunSetSweep}</span>
          <ErrorNotice message={sweeps.error} retry={sweeps.reload} />
          <select
            aria-label={text.reportRunSetSweep}
            value={runSet.sweepId}
            onChange={(event) => onChange({ sweepId: event.target.value })}
          >
            <option value="">{sweeps.value?.items.length === 0 ? text.reportRunSetSweepNone : text.none}</option>
            {sweeps.value?.items.map((sweep) => (
              <option key={sweep.id} value={sweep.id}>
                {sweep.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}

/**
 * 名前で探したRunを、チェックして選ぶ。前に選んだRunは、検索で隠れても選んだまま残る。
 * mediaKindがあれば、その種類のメディアを記録したRunだけを出す。
 */
export function RunChecklist({
  projectId,
  selectedIds,
  maxCount,
  mediaKind,
  onChange,
}: {
  projectId: string;
  selectedIds: string[];
  maxCount: number;
  mediaKind?: RunMediaKind;
  onChange: (runIds: string[]) => void;
}) {
  useLocale();
  const [name, setName] = useState('');
  const candidates = useRunCandidates(projectId, name);
  const withMedia = useRunsWithMediaKind(projectId, candidates.value?.items.map((run) => run.id) ?? [], mediaKind);
  const offeredRuns = candidates.value?.items.filter(
    (run) => !mediaKind || selectedIds.includes(run.id) || withMedia.value?.has(run.id),
  );
  const isLoading = !offeredRuns || (mediaKind !== undefined && candidates.value!.items.length > 0 && !withMedia.value);
  const isFull = selectedIds.length >= maxCount;
  return (
    <div className="report-run-checklist">
      <div className="report-run-checklist-toolbar">
        <input
          type="search"
          aria-label={text.reportRunSearchName}
          placeholder={text.reportRunSearchName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <span className="muted">{textTemplates.reportSelectedRunCount(selectedIds.length, maxCount)}</span>
      </div>
      <ErrorNotice message={candidates.error} retry={candidates.reload} />
      <ErrorNotice message={withMedia.error} retry={withMedia.reload} />
      {isLoading ? (
        withMedia.error ? null : <Loading />
      ) : offeredRuns.length === 0 ? (
        <p className="muted">{mediaKind === 'table' ? text.reportRunNoneWithTable : text.reportRunNone}</p>
      ) : (
        <ul>
          {offeredRuns.map((run) => {
            const isChecked = selectedIds.includes(run.id);
            return (
              <li key={run.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!isChecked && isFull}
                    onChange={() =>
                      onChange(isChecked ? selectedIds.filter((selected) => selected !== run.id) : [...selectedIds, run.id])
                    }
                  />
                  <span className="report-run-name">{run.name}</span>
                  <RunStatusBadge run={run} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
