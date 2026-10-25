import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SweepObjective, SweepTrial } from '@mmt/contracts';
import { formatNumber } from '../../lib/format';
import { objectiveProgress } from '../../lib/sweepTrials';
import { Empty } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// テーマで変わる色（styles/base.css）。recharts は SVG の属性にそのまま書くので、変数のまま渡せる。
const OBJECTIVE_COLOR = 'var(--chart-objective)';
const BEST_COLOR = 'var(--chart-best)';
const CHART_HEIGHT = 280;

/**
 * 試行ごとの目的値を点で、それまでの最良を階段状の線で描く（xは試行の番号）。rechartsの
 * キーボード操作でプロットはフォーカスの止まる場所1つになり、矢印キーでツールチップの試行を
 * 順にたどる。titleがスクリーンリーダー向けの名前になる。
 */
export function SweepProgressChart({ trials, objective }: { trials: SweepTrial[]; objective: SweepObjective }) {
  useLocale();
  const points = objectiveProgress(trials, objective.goal);
  if (!points.length) return <Empty>{text.sweepNoBestTrial}</Empty>;
  return (
    <div className="sweep-progress-chart" style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 24, left: 12, bottom: 8 }} accessibilityLayer
          title={`${text.sweepProgressChart}: ${objective.metric}`}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="trialIndex" type="number" domain={['dataMin', 'dataMax']} allowDecimals={false}
            tick={{ fontSize: 11 }} label={{ value: text.sweepTrialIndex, position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
          <YAxis tickFormatter={formatNumber} width={70} domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => (typeof value === 'number' ? formatNumber(value) : String(value))}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <Legend formatter={(name) => <span className="chart-legend-text">{name}</span>} />
          <Scatter dataKey="objective" name={text.sweepTrialObjective} fill={OBJECTIVE_COLOR} isAnimationActive={false} />
          <Line dataKey="bestSoFar" name={text.sweepBestSoFar} type="stepAfter" stroke={BEST_COLOR} dot={false}
            strokeWidth={2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
