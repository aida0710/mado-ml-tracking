import type { ChartXAxis } from '@mmt/contracts';
import { summarizeChartLines } from '../../lib/chartSummary';
import { formatXValue } from '../../lib/chartXAxis';
import { formatNumber } from '../../lib/format';
import type { ChartLine } from '../../lib/metricSeries';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

// Runの一覧は最大200本を描く。スクリーンリーダーにはこの本数までを読ませ、残りは本数だけ伝える。
const SUMMARIZED_LINE_COUNT = 5;

/**
 * スクリーンリーダーが図の名前の後に読む説明（aria-describedby）。描いた各線の最後の値と範囲、
 * 続いて図が反応するキー。画面では隠す。画面では線とフッターのヒントが同じことを伝える。
 */
export function ChartDescription({
  lines,
  xAxis,
  summaryId,
  keyboardHintId,
}: {
  lines: readonly ChartLine[];
  xAxis: ChartXAxis;
  summaryId: string;
  keyboardHintId: string;
}) {
  useLocale();
  const summaries = summarizeChartLines(lines);
  const sentences = summaries.slice(0, SUMMARIZED_LINE_COUNT).map((summary) =>
    textTemplates.chartLineSummary({
      label: summary.label,
      latest: formatNumber(summary.latest.value),
      latestAt: formatXValue(xAxis, summary.latest.x),
      min: formatNumber(summary.min),
      max: formatNumber(summary.max),
    }),
  );
  if (summaries.length > SUMMARIZED_LINE_COUNT)
    sentences.push(textTemplates.chartLineSummaryMore(summaries.length - SUMMARIZED_LINE_COUNT));
  return (
    <div className="sr-only">
      <p id={summaryId}>{joinSentences(sentences)}</p>
      <p id={keyboardHintId}>{text.chartKeyboardHint}</p>
    </div>
  );
}
