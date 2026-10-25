// 一番長い線種（一点鎖線、17px）の1周期が入る幅。見本に、線を描くときと同じ線種が出るようにする。
const SWATCH_WIDTH = 20;
const SWATCH_HEIGHT = 8;

/**
 * 図の線の色と線種の短い見本。凡例とツールチップで名前の横に出す。飾りとして扱い、どの線かは
 * 隣の名前が伝える。
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
