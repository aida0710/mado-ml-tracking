// Wide enough for one period of the longest line pattern (dash-dot, 17px), so the swatch shows the
// pattern the line is drawn with.
const SWATCH_WIDTH = 20;
const SWATCH_HEIGHT = 8;

/**
 * A short sample of a chart line in its color and line pattern, beside its name in the legend and
 * the tooltip. Decorative: the name next to it says which line it is.
 */
export function SeriesSwatch({
  color,
  dashPattern,
  kind = 'run',
}: {
  color: string;
  dashPattern: string | null;
  kind?: 'run' | 'group';
}) {
  return (
    <svg
      className={`chart-legend-swatch ${kind}`}
      width={SWATCH_WIDTH}
      height={SWATCH_HEIGHT}
      viewBox={`0 0 ${SWATCH_WIDTH} ${SWATCH_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={0}
        x2={SWATCH_WIDTH}
        y1={SWATCH_HEIGHT / 2}
        y2={SWATCH_HEIGHT / 2}
        stroke={color}
        strokeDasharray={dashPattern ?? undefined}
      />
    </svg>
  );
}
