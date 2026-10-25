import { useElementWidth } from '../../hooks/useElementWidth';
import { timeAxisTicks } from '../../lib/audioTimeAxis';
import type { TimeRange } from '../../lib/audioTimeline';

// "0:02.25"のようなラベルは10pxの等幅で約45px。64px離すとラベルどうしに隙間が残る。
const MIN_TICK_SPACING_PX = 64;
// ラベルは目盛りから右へ始まるので、右端にこれより近い目盛りは印だけ残してラベルを出さない。
const TICK_LABEL_WIDTH_PX = 48;

/**
 * 波形の下に、表示している範囲の時刻を出す。ズームしても今どこかが分かる。スクリーンリーダー
 * からは隠す。再生時刻はタイムラインのスライダーが既に読み上げる。
 */
export function AudioTimeAxis({ range }: { range: TimeRange }) {
  const { ref, width } = useElementWidth();
  const ticks = width > 0 ? timeAxisTicks(range, width / MIN_TICK_SPACING_PX) : [];
  return (
    <div ref={ref} className="audio-time-axis mono" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick.seconds} className="audio-time-tick" style={{ left: `${tick.fraction * 100}%` }}>
          {tick.fraction * width + TICK_LABEL_WIDTH_PX <= width && tick.label}
        </span>
      ))}
    </div>
  );
}
