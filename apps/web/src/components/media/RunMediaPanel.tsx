import { useMemo } from 'react';
import type { RunMediaKeySummary } from '@mmt/contracts';
import { useMediaLocation } from '../../hooks/useMediaLocation';
import { useRunMedia } from '../../hooks/useRunMedia';
import { groupMediaByStep, nearestStep } from '../../lib/mediaSteps';
import { ResponsiveTable } from '../ResponsiveTable';
import { Empty, Resource } from '../Feedback';
import { MediaGallery } from './MediaGallery';
import { MediaStepSlider } from './MediaStepSlider';
import type { RunMediaPanelProps } from '../charts/chartProps';
import { useLocale } from '../../i18n/useLocale';
import { mediaKindLabels } from '../../i18n/media';
import { text, textTemplates } from '../../i18n/catalog';

function KeyList({
  keys,
  selectedKey,
  onSelect,
}: {
  keys: RunMediaKeySummary[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={keys}
      rowKey={(summary) => summary.key}
      selectedKey={selectedKey}
      columns={[
        {
          key: 'key',
          header: text.mediaKey,
          priority: 'primary',
          // 長いキーは折り返し、stepの範囲と数を狭い左の列に収める。
          className: 'media-key-cell',
          render: (summary) => (
            <button type="button" className="link-button" onClick={() => onSelect(summary.key)}>
              {summary.key}
            </button>
          ),
        },
        { key: 'kind', header: text.mediaKind, priority: 'primary', render: (summary) => mediaKindLabels[summary.kind] },
        {
          key: 'steps',
          header: text.mediaStepRange,
          priority: 'secondary',
          className: 'mono',
          render: (summary) => textTemplates.mediaStepRangeValue(summary.minStep, summary.maxStep),
        },
        {
          key: 'count',
          header: text.mediaCount,
          priority: 'secondary',
          className: 'mono',
          render: (summary) => textTemplates.mediaItemCount(summary.count),
        },
      ]}
    />
  );
}

/**
 * Runのメディアのタブ。キーを選び、スライダーで記録のあるstepを順に移動する。キーを替えても
 * stepは保ち、新しいキーが記録した一番近いstepに合わせる。キーとstepはURLに残すので、リンクや
 * 再読み込みで同じメディアが開く。
 */
export function RunMediaPanel({ projectId, runId }: RunMediaPanelProps) {
  useLocale();
  const { chosenKey, requestedStep, setKey, setStep } = useMediaLocation();
  const { keys: keysQuery, selectedKey, items } = useRunMedia({ projectId, runId, chosenKey });
  const groups = useMemo(() => (items.value ? groupMediaByStep(items.value.items) : null), [items.value]);
  const steps = useMemo(() => (groups ? [...groups.keys()] : []), [groups]);
  // 既定は最新のstep。タブを開くのは、たいてい一番新しいメディアを見るためである。
  const step = requestedStep === null ? (steps.at(-1) ?? null) : nearestStep(steps, requestedStep);

  return (
    <Resource query={keysQuery}>
      {(keys) =>
        keys.length === 0 || selectedKey === null ? (
          <Empty>{text.mediaNoKeys}</Empty>
        ) : (
          <div className="run-media-panel">
            <section aria-label={text.mediaKeys}>
              <KeyList keys={keys} selectedKey={selectedKey} onSelect={setKey} />
            </section>
            <section className="run-media-step" aria-label={selectedKey}>
              <h3>{selectedKey}</h3>
              <Resource query={items}>
                {(list) =>
                  step === null ? (
                    <Empty />
                  ) : (
                    <>
                      <MediaStepSlider steps={steps} step={step} onStepChange={setStep} />
                      <p className="muted media-hint">{text.mediaStepHint}</p>
                      {list.truncated && <p className="notice">{text.mediaTruncated}</p>}
                      {/* stepをkeyにして、動かすたびに前のstepのプレイヤーをアンマウントする（止める）。 */}
                      <MediaGallery key={`${selectedKey}:${step}`} projectId={projectId} items={groups!.get(step) ?? []} />
                    </>
                  )
                }
              </Resource>
            </section>
          </div>
        )
      }
    </Resource>
  );
}
