import { z } from 'zod';
import { groupBySchema, keysSchema, xAxisSchema } from './metricSeries/metricSeriesValidation.js';

/** グラフのグリッドの幅。ChartPanelLayout.columnsはこの値に固定する。 */
const CHART_GRID_COLUMNS = 12;
// これより多くのグラフを1ページで描くより、別の保存ビューやレポートに分けた方が速い。
export const MAX_CHART_PANELS = 100;
// 行は下へ際限なく伸びる。この値は、どのレイアウトも作らない値を拒むためだけのもの。
const MAX_CHART_GRID_ROW = 10_000;
const MAX_CHART_PANEL_HEIGHT = 100;
// パネルのIDは画面側が作る（UUID）。この上限は乱用を拒むためだけのもの。
const MAX_CHART_PANEL_ID_LENGTH = 100;
const MAX_CHART_PANEL_TITLE_LENGTH = 200;

const chartPanelGridCellSchema = z
  .strictObject({
    x: z
      .number()
      .int()
      .min(0)
      .max(CHART_GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(MAX_CHART_GRID_ROW),
    w: z.number().int().min(1).max(CHART_GRID_COLUMNS),
    h: z.number().int().min(1).max(MAX_CHART_PANEL_HEIGHT),
  })
  .refine((cell) => cell.x + cell.w <= CHART_GRID_COLUMNS, 'panel exceeds the grid width');

export const chartPanelConfigSchema = z.strictObject({
  id: z.string().min(1).max(MAX_CHART_PANEL_ID_LENGTH),
  title: z.string().max(MAX_CHART_PANEL_TITLE_LENGTH).optional(),
  metricKeys: keysSchema,
  xAxis: xAxisSchema,
  yScale: z.enum(['linear', 'log']),
  smoothing: z.strictObject({
    kind: z.enum(['none', 'ema', 'gaussian', 'running_average']),
    weight: z.number().min(0).max(1),
  }),
  showRange: z.boolean(),
  groupBy: groupBySchema.optional(),
  layout: chartPanelGridCellSchema,
});

/** ChartPanelLayout（contracts/chartPanels.ts）。保存ビューとレポートで共有する。 */
export const chartPanelLayoutSchema = z.strictObject({
  version: z.literal(1),
  columns: z.literal(CHART_GRID_COLUMNS),
  panels: z
    .array(chartPanelConfigSchema)
    .max(MAX_CHART_PANELS)
    .refine(
      (panels) => new Set(panels.map((panel) => panel.id)).size === panels.length,
      'panel ids must be unique',
    ),
});
