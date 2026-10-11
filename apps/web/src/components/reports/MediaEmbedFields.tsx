import { useEffect, useState } from 'react';
import { MEDIA_COMPARE_MAX_RUNS, type ReportMediaBlock } from '@mmt/contracts';
import { useMediaCompareChoices } from '../../hooks/useMediaCompare';
import { defaultComparisonSteps } from '../../lib/mediaCompareSteps';
import { mediaStepsOrLatest } from '../../lib/reportBlocks';
import { ErrorNotice } from '../Feedback';
import { MediaStepChecklist } from '../media/MediaStepChecklist';
import { NameSelect } from './NameSelect';
import { RunChecklist } from './RunSetPicker';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * The settings of a media comparison embed: its Runs, the key and the steps. Choosing a key (or
 * other Runs) starts the steps at the latest one every Run recorded, as the Compare page opens.
 * Only media logged with a step can be compared here, and the fields say so when the Runs have none.
 */
export function MediaEmbedFields({
  projectId,
  block,
  onChange,
}: {
  projectId: string;
  block: ReportMediaBlock;
  onChange: (block: ReportMediaBlock) => void;
}) {
  const { choices, selectedKey, stepsByRun } = useMediaCompareChoices({
    projectId,
    runIds: block.runIds,
    chosenKey: block.key || null,
  });
  const [isAwaitingDefaultSteps, setAwaitingDefaultSteps] = useState(false);
  const recordedSteps = block.key && selectedKey === block.key ? stepsByRun.value : undefined;

  // The default steps come from the recorded steps, which load after the key or the Runs change.
  useEffect(() => {
    if (!isAwaitingDefaultSteps || !recordedSteps) return;
    setAwaitingDefaultSteps(false);
    onChange({ ...block, steps: mediaStepsOrLatest(defaultComparisonSteps(recordedSteps)) });
  }, [isAwaitingDefaultSteps, recordedSteps, block, onChange]);

  function changeTarget(target: Pick<ReportMediaBlock, 'runIds' | 'key'>) {
    // Steps recorded for the previous Runs or key may not exist for the new ones.
    onChange({ ...block, ...target, steps: undefined });
    setAwaitingDefaultSteps(target.key !== '');
  }

  const keys = choices.value?.keys;
  const runsWithoutKey =
    recordedSteps && choices.value
      ? choices.value.runs.filter((_run, index) => recordedSteps[index]?.length === 0).map((run) => run.name)
      : [];
  return (
    <>
      <fieldset className="report-run-set">
        <legend>{text.reportRunSet}</legend>
        <RunChecklist
          projectId={projectId}
          selectedIds={block.runIds}
          maxCount={MEDIA_COMPARE_MAX_RUNS}
          onChange={(runIds) => changeTarget({ runIds, key: block.key })}
        />
      </fieldset>
      {block.runIds.length > 0 && (
        <>
          <ErrorNotice message={choices.error} retry={choices.reload} />
          {keys?.length === 0 ? (
            <p className="notice report-media-no-steps">{text.reportMediaNoStepMedia}</p>
          ) : (
            <NameSelect
              label={text.reportMediaKey}
              value={block.key}
              options={(keys ?? []).map((summary) => ({ key: summary.key, label: summary.key }))}
              onChange={(key) => changeTarget({ runIds: block.runIds, key })}
            />
          )}
          <ErrorNotice message={block.key ? stepsByRun.error : null} retry={stepsByRun.reload} />
          {runsWithoutKey.length > 0 && (
            <p className="muted report-media-runs-without-key">{textTemplates.reportMediaRunsWithoutKey(runsWithoutKey.join('、'))}</p>
          )}
          {/* Shown once the default steps are in, so a tick made meanwhile is not overwritten. */}
          {recordedSteps && !isAwaitingDefaultSteps && (
            <MediaStepChecklist
              legend={text.reportMediaSteps}
              stepsByRun={recordedSteps}
              selected={block.steps ?? []}
              hint={text.mediaCompareNoStepsHint}
              onChange={(steps) => onChange({ ...block, steps: mediaStepsOrLatest(steps) })}
            />
          )}
        </>
      )}
    </>
  );
}
