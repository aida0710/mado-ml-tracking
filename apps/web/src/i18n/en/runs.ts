export const runsText = {
  queryHint: "Name, or metrics.loss < 0.1 AND params.batch_size = '32'",
  filterEmpty: "Enter a search expression.",
  firstPage: "First page",
  mediaTab: 'Media',
  analysisTab: "Analysis",
  charts: "Charts",
  showCharts: "Show charts",
  hideCharts: "Hide charts",
  addChart: "Add chart",
  resetChartLayout: "Reset to default layout",
  noChartPanels: "No charts. Create one with “Add chart”.",
  noChartMetrics: "No metrics available to chart yet.",
  chartNoRuns: "No runs selected for charts. Select runs in the list.",
  editChart: "Configure chart",
  removeChart: "Delete chart",
  moveChartUp: "Move up",
  moveChartDown: "Move down",
  moveChartLeft: "Move left",
  moveChartRight: "Move right",
  chartWidthThird: "Width 1/3",
  chartWidthHalf: "Width 1/2",
  chartWidthFull: "Full width",
  chartHeightTall: "Increase height",
  chartLayoutActions: "Layout",
  chartPanelTitle: "Title",
  chartPanelTitleHint: "Leave blank to show the metric name",
  chartMetricKeys: "Metrics to display",
  chartMetricKeySearch: "Search metrics",
  chartMetricKeysRequired: "Select at least one metric.",
  chartMetricKeyNoMatch: "No matching metrics.",
  chartGrouping: "Grouping",
  chartGroupingNone: "No",
  chartGroupingTag: 'Tag',
  chartGroupingParam: 'Param',
  chartGroupingExperiment: 'Experiment',
  chartGroupingKey: "Group by key",
  chartTarget: "Runs to chart",
  chartGroupingAppliesToAll: "All charts show each group's average and range.",
  systemMetricsEmpty: "No system metrics yet.",
  resumeTimeline: "Execution segments",
  resumeSegmentRunning: "Running",
  resumeSegmentStart: "Start",
  resumeSegmentEnd: "End",
  resumeSegmentFirstStep: "First step",
  resumeSegmentEndStatus: "End status",
} as const;

/** Panel titles of the system metrics tab, by category. */
export const systemMetricCategoryLabels = {
  cpu: 'CPU',
  memory: "Memory",
  disk: "Disk",
  network: "Network",
  gpu: 'GPU',
  other: "Other",
} as const;

/** Units of the system metrics panels. MLflow megabytes are drawn in bytes. */
export const systemMetricUnitLabels = {
  percent: '%',
  bytes: 'bytes',
  bytes_per_second: "bytes/s",
  bytes_total: "Cumulative bytes since start",
  load: 'load average',
  celsius: '℃',
  watts: 'W',
  value: "Value",
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const runsTextTemplates = {
  filterUnexpectedAt: (position: number) =>
    `Check character ${position} in the search expression. Join comparisons of metrics, params, or tags with AND and quote strings (e.g. metrics.loss < 0.1 AND params.lr = '0.01').`,
  metricAscending: (name: string) => `${name} (ascending)`,
  metricDescending: (name: string) => `${name} (descending)`,
  pageNumber: (page: number) => `Page ${page}`,
  chartMetricKeysSelected: (count: number, limit: number) => `${count} / ${limit} selected`,
  chartTopRuns: (count: number) => `Top ${count} search results`,
  chartSelectedRuns: (count: number) => `${count} selected`,
  systemMetricPanelTitle: (category: string, unit: string, gpuIndex: number | null) =>
    gpuIndex === null ? `${category} (${unit})` : `${category} ${gpuIndex} (${unit})`,
  resumeSegmentLabel: (index: number) => (index === 0 ? "First execution" : `Resume ${index}`),
};
