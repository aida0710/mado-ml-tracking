// mado ML TrackingのworkerとPython SDK（mado-tracking）が記録するシステムメトリクス
// （`system.cpu.percent`、`system.gpu.0.utilization_percent`、...）と、
// MLflowのシステムメトリクスの記録（`system/cpu_utilization_percentage`、
// `system/gpu_0_utilization_percentage`、...）を同じ分類と単位に振り分け、どちらのRunも
// 同じパネルで開くようにする。名前の対応は
// docs/worker.mdの「MLflowの`system/`名との対応」の表。

import type { ChartValueUnit } from './chartTicks';

export type SystemMetricCategory = 'cpu' | 'memory' | 'disk' | 'network' | 'gpu' | 'other';
/**
 * `bytes_total`はMLflowのネットワークのカウンタで、レートではなく監視開始からのメガバイト数。
 * そのため、mado ML Trackingの毎秒の値とはパネルを共有せず、専用のパネルにする。
 */
export type SystemMetricUnit =
  | 'percent'
  | 'bytes'
  | 'bytes_per_second'
  | 'bytes_total'
  | 'load'
  | 'celsius'
  | 'watts'
  | 'value';

export interface SystemMetricKey {
  key: string;
  category: SystemMetricCategory;
  /** GPUのメトリクスではnvidia-smi/NVMLのインデックス、それ以外はnull。 */
  gpuIndex: number | null;
  unit: SystemMetricUnit;
  /** 記録された値から単位への倍率。MLflowはメガバイト（10^6バイト）で記録する。 */
  scale: number;
}

const BYTES_PER_MEGABYTE = 1_000_000;
const SYSTEM_PREFIX = /^system[./]/;

export const isSystemMetricKey = (key: string) => SYSTEM_PREFIX.test(key);

// 名前の最後の部分の接尾辞 → 単位。`_bytes_per_second`が勝つように、長い接尾辞を先に置く。
const madoUnits: Array<[string, SystemMetricUnit]> = [
  ['bytes_per_second', 'bytes_per_second'],
  ['bytes', 'bytes'],
  ['percent', 'percent'],
  ['celsius', 'celsius'],
  ['watts', 'watts'],
  ['load1', 'load'],
];
const madoCategories: Record<string, SystemMetricCategory> = {
  cpu: 'cpu',
  memory: 'memory',
  process: 'memory',
  disk: 'disk',
  network: 'network',
  gpu: 'gpu',
};

function classifyMadoKey(key: string): SystemMetricKey {
  const [, area = '', ...rest] = key.split('.');
  const category = madoCategories[area] ?? 'other';
  const gpuIndex = category === 'gpu' && /^\d+$/.test(rest[0] ?? '') ? Number(rest[0]) : null;
  const name = rest.at(-1) ?? '';
  const unit = madoUnits.find(([suffix]) => name.endsWith(suffix))?.[1] ?? 'value';
  return { key, category: category === 'gpu' && gpuIndex === null ? 'other' : category, gpuIndex, unit, scale: 1 };
}

function classifyMlflowKey(key: string): SystemMetricKey {
  const name = key.slice('system/'.length);
  const gpu = /^gpu_(\d+)_/.exec(name);
  const category: SystemMetricCategory = gpu
    ? 'gpu'
    : name.startsWith('cpu_')
      ? 'cpu'
      : name.startsWith('system_memory_')
        ? 'memory'
        : name.startsWith('disk_')
          ? 'disk'
          : name.startsWith('network_')
            ? 'network'
            : 'other';
  const gpuIndex = gpu ? Number(gpu[1]) : null;
  if (name.endsWith('_percentage')) return { key, category, gpuIndex, unit: 'percent', scale: 1 };
  if (name.endsWith('_watts')) return { key, category, gpuIndex, unit: 'watts', scale: 1 };
  if (name.endsWith('_megabytes'))
    return {
      key,
      category,
      gpuIndex,
      unit: category === 'network' ? 'bytes_total' : 'bytes',
      scale: BYTES_PER_MEGABYTE,
    };
  return { key, category, gpuIndex, unit: 'value', scale: 1 };
}

/** システムメトリクスでないキーにはnull。 */
export function classifySystemMetricKey(key: string): SystemMetricKey | null {
  if (key.startsWith('system.')) return classifyMadoKey(key);
  if (key.startsWith('system/')) return classifyMlflowKey(key);
  return null;
}

/** 記録された値を、そのパネルの単位に変換する倍率（ほかのメトリクスは1）。 */
export const systemMetricValueScale = (key: string) => classifySystemMetricKey(key)?.scale ?? 1;

const valueUnitOfSystemUnit: Partial<Record<SystemMetricUnit, ChartValueUnit>> = {
  bytes: 'bytes',
  bytes_total: 'bytes',
  bytes_per_second: 'bytes_per_second',
};

/** パネルの値の軸に出す単位。すべてのキーがバイトを測るときだけ、バイトの単位にする。 */
export function chartValueUnit(keys: readonly string[]): ChartValueUnit {
  const units = new Set(
    keys.map((key) => {
      const unit = classifySystemMetricKey(key)?.unit;
      return (unit && valueUnitOfSystemUnit[unit]) ?? 'number';
    }),
  );
  return units.size === 1 ? [...units][0]! : 'number';
}

export interface SystemMetricPanelGroup {
  /** どちらの命名のRunでも変わらないid。例: `gpu.0.percent`。 */
  id: string;
  category: SystemMetricCategory;
  gpuIndex: number | null;
  unit: SystemMetricUnit;
  metricKeys: string[];
}

const categoryOrder: SystemMetricCategory[] = ['cpu', 'memory', 'disk', 'network', 'gpu', 'other'];
const unitOrder: SystemMetricUnit[] = [
  'percent',
  'bytes',
  'bytes_per_second',
  'bytes_total',
  'load',
  'celsius',
  'watts',
  'value',
];

/**
 * 分類・GPUのインデックス・単位ごとに1つのグループを作り、決まった順（CPU、メモリ、ディスク、
 * ネットワーク、各GPU、残り）に並べる。分類できないsystemの名前は、単位が合わないかもしれない
 * パネルに混ぜず、それぞれ専用のグループにする。
 */
export function groupSystemMetricKeys(keys: string[]): SystemMetricPanelGroup[] {
  const groups = new Map<string, SystemMetricPanelGroup>();
  for (const key of [...new Set(keys)].sort()) {
    const metric = classifySystemMetricKey(key);
    if (!metric) continue;
    const id =
      metric.category === 'other' || metric.unit === 'value'
        ? `other.${key}`
        : [metric.category, metric.gpuIndex, metric.unit].filter((part) => part !== null).join('.');
    const group = groups.get(id) ?? {
      id,
      category: metric.unit === 'value' ? 'other' : metric.category,
      gpuIndex: metric.unit === 'value' ? null : metric.gpuIndex,
      unit: metric.unit,
      metricKeys: [],
    };
    group.metricKeys.push(key);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
      (left.gpuIndex ?? 0) - (right.gpuIndex ?? 0) ||
      unitOrder.indexOf(left.unit) - unitOrder.indexOf(right.unit) ||
      left.id.localeCompare(right.id),
  );
}
