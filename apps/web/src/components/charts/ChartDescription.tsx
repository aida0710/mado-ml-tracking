import { useLocale } from '../../i18n/useLocale';
import type { ChartXAxis } from '@mmt/contracts';
import { summarizeChartLines } from '../../lib/chartSummary';
import { formatXValue } from '../../lib/chartXAxis';
import { formatNumber } from '../../lib/format';
import type { ChartLine } from '../../lib/metricSeries';
import { text, textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

// A Run list draws up to 200 lines; a screen reader hears this many and the count of the rest.
const SUMMARIZED_LINE_COUNT = 5;

/**
 * What a screen reader hears after the chart's name (its aria-describedby): each drawn line's last
 * value and range, then the keys the chart answers. Hidden on screen, where the lines and the
 * footer's hint say the same.
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
