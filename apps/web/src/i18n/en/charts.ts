import { formatEnglishCount } from '../formatEnglishCount';
export const chartsText = {
  chartNoData: "No values to display",
  chartSmoothing: "Smoothing",
  chartSmoothingNone: "None",
  chartSmoothingEma: "EMA (exponential moving average)",
  chartSmoothingGaussian: "Gaussian",
  chartSmoothingRunningAverage: "Moving average",
  chartSmoothingWeight: "Smoothing strength",
  chartXAxis: "X axis",
  chartXAxisStep: 'Step',
  chartXAxisRelativeTime: "Elapsed time",
  chartXAxisWallTime: "Time",
  chartXAxisMetric: "Metrics",
  chartXAxisMetricKey: "X-axis metric",
  chartLogX: "Logarithmic X axis",
  chartLogY: "Logarithmic Y axis",
  chartShowRange: "Show range (min–max)",
  chartShowRaw: "Show unsmoothed lines",
  chartLegend: "Legend",
  chartShowAllSeries: "Show all",
  chartResetZoom: "Reset zoom",
  chartZoomHint: "Drag to zoom into a range",
  chartResumeMarker: "Resume",
  chartGroupSuffix: "(average)",
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const chartsTextTemplates = {
  chartLogExcluded: (count: number) =>
    `${formatEnglishCount(count, 'non-positive point')} ${count === 1 ? 'is' : 'are'} omitted from the logarithmic axis.`,
  chartTooltipMore: (count: number) => `${count} more`,
  chartAriaLabel: (seriesCount: number) => `Metric chart (${seriesCount} series)`,
  chartResumeMarkerOf: (runLabel: string) => `Resume ${runLabel}`,
};
