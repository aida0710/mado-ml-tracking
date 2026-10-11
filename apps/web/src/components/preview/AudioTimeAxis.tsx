import { useElementWidth } from '../../hooks/useElementWidth';
import { timeAxisTicks } from '../../lib/audioTimeAxis';
import type { TimeRange } from '../../lib/audioTimeline';

// A label such as "0:02.25" is about 45px in the 10px monospace font; 64px apart keeps a gap between them.
const MIN_TICK_SPACING_PX = 64;
// Labels start at their tick, so a tick closer than this to the right edge keeps its mark but no label.
const TICK_LABEL_WIDTH_PX = 48;

/**
 * The times of the visible range under the waveform, so a zoomed view still says where it is.
 * Hidden from screen readers: the timeline slider already reads out the playback time.
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
