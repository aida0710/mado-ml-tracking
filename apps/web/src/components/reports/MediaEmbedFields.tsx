import { useLayoutEffect, useRef } from 'react';
import { MEDIA_COMPARE_MAX_RUNS, type ReportMediaBlock } from '@mmt/contracts';
import { useMediaCompareChoices } from '../../hooks/useMediaCompare';
import { defaultComparisonSteps } from '../../lib/mediaCompareSteps';
import { mediaStepsOrLatest } from '../../lib/reportBlocks';
import { ErrorNotice } from '../Feedback';
import { MediaStepChecklist } from '../media/MediaStepChecklist';
import { NameSelect } from './NameSelect';
import { RunChecklist } from './RunSetPicker';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

/**
 * メディアの比較の埋め込みの設定。Run、キー、step。キー（または別のRun）を選ぶと、Compareの
 * 画面が開くときと同じく、全Runが記録した最新のstepからstepを始める。ここで比べられるのは
 * stepを付けて記録したメディアだけで、Runにそれが無いときは項目がその旨を伝える。
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
  useLocale();
  const { choices, selectedKey, stepsByRun } = useMediaCompareChoices({
    projectId,
    runIds: block.runIds,
    chosenKey: block.key || null,
  });
  // Runかキーが変わり、その既定のstepをまだ選んでいないかどうか。
  const isAwaitingDefaultStepsRef = useRef(false);
  const recordedSteps = block.key && selectedKey === block.key ? stepsByRun.value : undefined;

  // 既定のstepは記録のあるstepから決まり、記録のあるstepはキーかRunが変わった後に読み込まれる。
  // layout effectでブラウザが描画する前に当てるので、stepのチェックリストが既定のstep無しで
  // 出ることはなく、付けたチェックが上書きされることも無い。
  useLayoutEffect(() => {
    if (!isAwaitingDefaultStepsRef.current || !recordedSteps) return;
    isAwaitingDefaultStepsRef.current = false;
    onChange({ ...block, steps: mediaStepsOrLatest(defaultComparisonSteps(recordedSteps)) });
  }, [recordedSteps, block, onChange]);

  function changeTarget(target: Pick<ReportMediaBlock, 'runIds' | 'key'>) {
    // 前のRunやキーで記録されたstepは、新しいものには無いかもしれない。
    isAwaitingDefaultStepsRef.current = target.key !== '';
    onChange({ ...block, ...target, steps: undefined });
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
            <p className="muted report-media-runs-without-key">{textTemplates.reportMediaRunsWithoutKey(formatList(runsWithoutKey))}</p>
          )}
          {recordedSteps && (
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
