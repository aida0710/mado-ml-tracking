import { MEDIA_COMPARE_MAX_RUNS } from '@mmt/contracts';
import { useMediaCompare } from '../../hooks/useMediaCompare';
import { useMediaLocation } from '../../hooks/useMediaLocation';
import { commonSteps } from '../../lib/mediaCompareSteps';
import { evenlySpacedSteps, sortedSteps } from '../../lib/mediaSteps';
import { Empty, ErrorNotice, Resource } from '../Feedback';
import { MediaCompareGrid } from './MediaCompareGrid';
import { MediaStepChecklist } from './MediaStepChecklist';
import type { MediaCompareProps } from '../charts/chartProps';
import { useLocale } from '../../i18n/useLocale';
import { mediaKindLabels } from '../../i18n/media';
import { text, textTemplates } from '../../i18n/catalog';
import { formatNote } from '../../i18n/textJoining';

// 均等に並べる近道の列数。学習の経過を追うには足り、1画面に収まるほど少ない。
const EVENLY_SPACED_COLUMNS = 8;

/**
 * Compareの画面のメディアのタブ。比べるRunにまたがって1つのキーをRun × stepのグリッドで出す。
 * 全Runが記録した最新のstepで開くので、最初のグリッドに空のセルは無い。stepは記録のある
 * ものから選ぶ。キーとstepはURLに残し、リンクで同じグリッドが開くようにする。
 */
export function MediaCompare({ projectId, runIds }: MediaCompareProps) {
  useLocale();
  const { chosenKey, steps, setComparedKey, setSteps } = useMediaLocation();
  const comparedRunIds = runIds.slice(0, MEDIA_COMPARE_MAX_RUNS);
  const { choices, selectedKey, stepsByRun, shownSteps, grid } = useMediaCompare({
    projectId,
    runIds: comparedRunIds,
    chosenKey,
    steps,
  });

  return (
    <Resource query={choices}>
      {({ runs, keys }) => {
        if (keys.length === 0 || selectedKey === null) return <Empty>{text.mediaCompareNoKeys}</Empty>;
        const runLabels = Object.fromEntries(runs.map((run) => [run.id, run.name]));
        const recorded = sortedSteps(stepsByRun.value?.flat() ?? []);
        const hasCommonStep = stepsByRun.value !== undefined && commonSteps(stepsByRun.value).length > 0;
        return (
          <div className="media-compare">
            {runIds.length > MEDIA_COMPARE_MAX_RUNS && (
              <p className="notice">{textTemplates.mediaCompareTooManyRuns(MEDIA_COMPARE_MAX_RUNS)}</p>
            )}
            <div className="media-compare-toolbar">
              <label className="audio-viewer-select">
                {text.mediaCompareKey}
                <select value={selectedKey} onChange={(event) => setComparedKey(event.target.value)}>
                  {keys.map((summary) => (
                    <option key={summary.key} value={summary.key}>
                      {summary.key}{formatNote(mediaKindLabels[summary.kind])}
                    </option>
                  ))}
                </select>
              </label>
              {recorded.length > 0 && (
                <span className="muted media-hint">
                  {textTemplates.mediaCompareRecordedSteps(recorded.length, recorded[0]!, recorded.at(-1)!)}
                </span>
              )}
            </div>
            <ErrorNotice message={stepsByRun.error} retry={stepsByRun.reload} />
            {stepsByRun.value && (
              <MediaStepChecklist
                legend={text.mediaCompareSteps}
                stepsByRun={stepsByRun.value}
                selected={shownSteps ?? []}
                onChange={setSteps}
                hint={hasCommonStep ? text.mediaCompareNoStepsHint : text.mediaCompareNoCommonStep}
                actions={
                  <>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setSteps(null)}
                      disabled={steps === null || !hasCommonStep}
                    >
                      {text.mediaCompareLatestCommon}
                    </button>
                    <button type="button" className="button small" onClick={() => setSteps([])} disabled={shownSteps?.length === 0}>
                      {text.mediaCompareLatest}
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setSteps(evenlySpacedSteps(recorded, EVENLY_SPACED_COLUMNS))}
                      disabled={recorded.length === 0}
                    >
                      {textTemplates.mediaCompareEvenly(Math.min(EVENLY_SPACED_COLUMNS, recorded.length))}
                    </button>
                  </>
                }
              />
            )}
            <Resource query={grid}>
              {(data) => (
                <MediaCompareGrid
                  key={`${data.key}:${data.steps?.join(',') ?? 'latest'}`}
                  projectId={projectId}
                  grid={data}
                  runLabels={runLabels}
                />
              )}
            </Resource>
          </div>
        );
      }}
    </Resource>
  );
}
