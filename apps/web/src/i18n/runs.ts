import * as english from './en/runs';
import { localized } from './localized';
// Run list, server-side Run search, and its paging. native-run-search owns the entries.
// Chart panels on the Run pages, system metrics and resumed segments: chart-panels-and-pages-web.
export const runsText = localized({
  // Short enough to read whole in the search box; the full grammar is in the error messages.
  queryHint: '名前、または metrics.loss < 0.1',
  searchWithSuggestion: 'この式で検索',
  filterEmpty: '検索式を入力してください。',
  firstPage: '最初のページ',
  mediaTab: 'Media',
  analysisTab: '分析',
  charts: '図',
  showCharts: '図を表示',
  hideCharts: '図を隠す',
  addChart: '図を追加',
  resetChartLayout: '既定の配置に戻す',
  noChartPanels: '図がありません。「図を追加」から作成します。',
  noChartMetrics: '図にできるメトリクスがまだありません。',
  chartNoRuns: '図にするRunがありません。一覧でRunを選んでください。',
  editChart: '図を設定',
  removeChart: '図を削除',
  moveChartUp: '上へ移動',
  moveChartDown: '下へ移動',
  moveChartLeft: '左へ移動',
  moveChartRight: '右へ移動',
  chartWidthThird: '幅 1/3',
  chartWidthHalf: '幅 1/2',
  chartWidthFull: '全幅',
  chartHeightTall: '高くする',
  chartLayoutActions: '配置',
  chartPanelTitle: 'タイトル',
  chartPanelTitleHint: '空欄ならメトリクス名を表示します',
  chartMetricKeys: '表示するメトリクス',
  chartMetricKeySearch: 'メトリクスを検索',
  chartMetricKeysRequired: 'メトリクスを1つ以上選んでください。',
  chartMetricKeyNoMatch: '一致するメトリクスはありません。',
  chartGrouping: 'グループ化',
  chartGroupingNone: 'しない',
  chartGroupingTag: 'Tag',
  chartGroupingParam: 'Param',
  chartGroupingExperiment: 'Experiment',
  chartGroupingKey: 'グループ化するキー',
  chartTarget: '図にするRun',
  chartGroupingAppliesToAll: 'すべての図で、グループごとの平均と範囲を描きます。',
  systemMetricsEmpty:
    'システムメトリクスはまだありません。SDKでは start_run(..., system_metrics=True)、MLflow 3では mlflow.start_run(log_system_metrics=True) で、CPU・GPU・メモリの使用量を記録します。',
  resumeTimeline: '実行区間',
  resumeSegmentRunning: '実行中',
  resumeSegmentStart: '開始',
  resumeSegmentEnd: '終了',
  resumeSegmentFirstStep: '最初のstep',
  resumeSegmentEndStatus: '終了状態',
  // Where nothing is recorded yet: the next step instead of "no match".
  runsNoneInExperiment:
    'この実験にはまだRunがありません。［SDKで記録］の例を学習コードに入れて実行すると、Runが作られてここに並びます。',
  runsNoneInProject:
    'このプロジェクトにはまだRunがありません。［SDKで記録］の例を学習コードに入れて実行すると、Runが作られてここに並びます。',
  runsNoneForViewer:
    'まだRunがありません。Runを記録できるのは、このプロジェクトのEditor以上のメンバーです。',
  experimentsNoneYet:
    'まだ実験がありません。実験は、同じ目的のRunをまとめる単位です（例: whisper-small-finetune）。［最初の実験を作成］で作るか、SDKのexperiment_name・MLflowのset_experimentに名前を渡すと、記録を始めたときに作られます。',
  experimentsNoneForViewer: 'まだ実験がありません。',
  experimentSidebarEmpty: 'まだ実験がありません。右上の［＋］で作成します。',
  experimentSidebarNoMatch: '一致する実験はありません。',
  newFirstExperiment: '最初の実験を作成',
  experimentNameHint: '同じ目的のRunをまとめる名前にします（例: whisper-small-finetune）。',
  experimentNameTaken: '同じ名前の実験が既にあります。',
  openExistingExperiment: 'その実験を開く',
  runIdLabel: 'Run ID',
  manualRunNotice:
    '画面から作ったRunは「待機中」で始まり、そのままでは進みません。コードバージョンを選んでおくと、作成後にRunの詳細の［ジョブを起動］で実行できます。学習コードからmetricsを記録するときは、このフォームは使わずに［SDKで記録］の例を使います（Runは記録を始めたときに作られます）。',
} as const, english.runsText);

/** Panel titles of the system metrics tab, by category. */
export const systemMetricCategoryLabels = localized({
  cpu: 'CPU',
  memory: 'メモリ',
  disk: 'ディスク',
  network: 'ネットワーク',
  gpu: 'GPU',
  other: 'その他',
} as const, english.systemMetricCategoryLabels);

/** Units of the system metrics panels. MLflow megabytes are drawn in bytes. */
export const systemMetricUnitLabels = localized({
  percent: '%',
  bytes: 'bytes',
  bytes_per_second: 'bytes/秒',
  bytes_total: '開始からの累計 bytes',
  load: 'load average',
  celsius: '℃',
  watts: 'W',
  value: '値',
} as const, english.systemMetricUnitLabels);

// Text that embeds values; merged into catalog's textTemplates.
export const runsTextTemplates = localized({
  runExecutionMode: (mode: string) => `実行モード: ${mode}`,
  filterUnexpectedAt: (position: number) =>
    `検索式の${position}文字目を確認してください。metrics / params / tags などの比較をANDでつなげ、文字列は引用符で囲みます（例: metrics.loss < 0.1 AND params.lr = '0.01'）。`,
  // A comparison that does not suit its field: what the field holds, and the comparison fixed.
  filterStringOperator: ({
    field,
    operator,
    example,
  }: {
    field: string;
    operator: string;
    example: string;
  }) =>
    `${field}は文字列として比べるので「${operator}」は使えません。使えるのは = != LIKE ILIKE です（例: ${example}）。大小で比べられるのはmetricsだけです。`,
  filterQuoteValue: (field: string, example: string) =>
    `${field}の値は文字列なので、引用符で囲みます（例: ${example}）。`,
  filterNumberOperator: (field: string, operator: string) =>
    `${field}は数値として比べるので「${operator}」は使えません。= != > >= < <= を使います（例: ${field} < 0.1）。`,
  filterNumberValue: (field: string) =>
    `${field}の値は数値で書きます。引用符は付けません（例: ${field} < 0.1）。`,
  filterSuggestion: (searchText: string, suggestion: string) =>
    `「${searchText}」はRun名として探しました。メトリクスやパラメータで絞り込むときは、${suggestion} のように metrics. や params. を付けます。`,
  metricAscending: (name: string) => `${name}（昇順）`,
  metricDescending: (name: string) => `${name}（降順）`,
  pageNumber: (page: number) => `${page}ページ目`,
  chartMetricKeysSelected: (count: number, limit: number) => `${count} / ${limit} 件を選択`,
  chartTopRuns: (count: number) => `検索結果の上位 ${count} 件`,
  chartSelectedRuns: (count: number) => `選択した ${count} 件`,
  systemMetricPanelTitle: (category: string, unit: string, gpuIndex: number | null) =>
    gpuIndex === null ? `${category}（${unit}）` : `${category} ${gpuIndex}（${unit}）`,
  resumeSegmentLabel: (index: number) => (index === 0 ? '最初の実行' : `再開 ${index}`),
}, english.runsTextTemplates);
