export const runsText = {
  // 検索欄で全体が読める短さにする。文法の全体はエラーメッセージで示す。
  queryHint: 'Name, or metrics.loss < 0.1',
  searchWithSuggestion: 'Search with this expression',
  filterEmpty: 'Enter a search expression.',
  firstPage: 'First page',
  mediaTab: 'Media',
  analysisTab: 'Analysis',
  charts: 'Charts',
  showCharts: 'Show charts',
  hideCharts: 'Hide charts',
  addChart: 'Add chart',
  resetChartLayout: 'Reset to default layout',
  noChartPanels: 'No charts. Create one with “Add chart”.',
  noChartMetrics: 'No metrics available to chart yet.',
  chartNoRuns: 'No runs selected for charts. Select runs in the list.',
  editChart: 'Configure chart',
  removeChart: 'Delete chart',
  moveChartUp: 'Move up',
  moveChartDown: 'Move down',
  moveChartLeft: 'Move left',
  moveChartRight: 'Move right',
  chartWidthThird: 'Width 1/3',
  chartWidthHalf: 'Width 1/2',
  chartWidthFull: 'Full width',
  chartHeightTall: 'Increase height',
  chartLayoutActions: 'Layout',
  chartPanelTitle: 'Title',
  chartPanelTitleHint: 'Leave blank to show the metric name',
  chartMetricKeys: 'Metrics to display',
  chartMetricKeySearch: 'Search metrics',
  chartMetricKeysRequired: 'Select at least one metric.',
  chartMetricKeyNoMatch: 'No matching metrics.',
  chartGrouping: 'Grouping',
  chartGroupingNone: 'None',
  chartGroupingTag: 'Tag',
  chartGroupingParam: 'Param',
  chartGroupingExperiment: 'Experiment',
  chartGroupingKey: 'Group by key',
  chartTarget: 'Runs to chart',
  chartGroupingAppliesToAll: "All charts show each group's average and range.",
  systemMetricsEmpty:
    'No system metrics yet. Record CPU, GPU, and memory usage with start_run(..., system_metrics=True) in the SDK or mlflow.start_run(log_system_metrics=True) in MLflow 3.',
  resumeTimeline: 'Execution segments',
  resumeSegmentRunning: 'Running',
  resumeSegmentStart: 'Start',
  resumeSegmentEnd: 'End',
  resumeSegmentFirstStep: 'First step',
  resumeSegmentEndStatus: 'End status',
  // まだ何も記録されていないところでは、「一致なし」でなく次にやることを示す。
  runsNoneInExperiment:
    'No runs in this experiment yet. Add the “Record with SDK” example to your training code and run it; the run is created and listed here.',
  runsNoneInProject:
    'No runs in this project yet. Add the “Record with SDK” example to your training code and run it; the run is created and listed here.',
  runsNoneForViewer:
    'No runs yet. Only project members with the Editor role or above can record runs.',
  experimentsNoneYet:
    'No experiments yet. An experiment groups runs with the same purpose (e.g. whisper-small-finetune). Create one with “Create first experiment”, or pass a name to experiment_name in the SDK or set_experiment in MLflow; the experiment is created when recording starts.',
  experimentsNoneForViewer: 'No experiments yet.',
  experimentSidebarEmpty: 'No experiments yet. Create one with the + button at the top right.',
  experimentSidebarNoMatch: 'No matching experiments.',
  newFirstExperiment: 'Create first experiment',
  experimentNameHint: 'Use a name that groups runs with the same purpose (e.g. whisper-small-finetune).',
  experimentNameTaken: 'An experiment with this name already exists.',
  openExistingExperiment: 'Open that experiment',
  runIdLabel: 'Run ID',
  manualRunNotice:
    "Runs created here start as “Queued” and do not progress on their own. If you select a code version, you can run it after creation with “Launch job” on the run's details. To record metrics from training code, use the “Record with SDK” example instead of this form (the run is created when recording starts).",
} as const;

/** システムメトリクスのタブのパネルの見出し（分類ごと）。 */
export const systemMetricCategoryLabels = {
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  network: 'Network',
  gpu: 'GPU',
  other: 'Other',
} as const;

/** システムメトリクスのパネルの単位。MLflowのメガバイトはバイトにして描く。 */
export const systemMetricUnitLabels = {
  percent: '%',
  bytes: 'bytes',
  bytes_per_second: 'bytes/s',
  bytes_total: 'Cumulative bytes since start',
  load: 'load average',
  celsius: '℃',
  watts: 'W',
  value: 'Value',
} as const;

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const runsTextTemplates = {
  runExecutionMode: (mode: string) => `Execution mode: ${mode}`,
  filterUnexpectedAt: (position: number) =>
    `Check character ${position} in the search expression. Join comparisons of metrics, params, or tags with AND and quote strings (e.g. metrics.loss < 0.1 AND params.lr = '0.01').`,
  // 項目に合わない比較。その項目が持つ値の種類と、直した比較を示す。
  filterStringOperator: ({
    field,
    operator,
    example,
  }: {
    field: string;
    operator: string;
    example: string;
  }) =>
    `${field} is compared as a string, so “${operator}” cannot be used. Use = != LIKE ILIKE (e.g. ${example}). Only metrics can be compared with < and >.`,
  filterQuoteValue: (field: string, example: string) =>
    `${field} values are strings, so quote them (e.g. ${example}).`,
  filterNumberOperator: (field: string, operator: string) =>
    `${field} is compared as a number, so “${operator}” cannot be used. Use = != > >= < <= (e.g. ${field} < 0.1).`,
  filterNumberValue: (field: string) =>
    `Write ${field} values as numbers, without quotes (e.g. ${field} < 0.1).`,
  filterSuggestion: (searchText: string, suggestion: string) =>
    `Searched for “${searchText}” as a run name. To filter by metrics or parameters, add metrics. or params., as in ${suggestion}.`,
  metricAscending: (name: string) => `${name} (ascending)`,
  metricDescending: (name: string) => `${name} (descending)`,
  pageNumber: (page: number) => `Page ${page}`,
  chartMetricKeysSelected: (count: number, limit: number) => `${count} / ${limit} selected`,
  chartTopRuns: (count: number) => `Top ${count} search results`,
  chartSelectedRuns: (count: number) => `${count} selected`,
  systemMetricPanelTitle: (category: string, unit: string, gpuIndex: number | null) =>
    gpuIndex === null ? `${category} (${unit})` : `${category} ${gpuIndex} (${unit})`,
  resumeSegmentLabel: (index: number) => (index === 0 ? 'First execution' : `Resume ${index}`),
};
