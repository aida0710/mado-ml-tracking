import { RUN_GROUP_NONE } from '@mmt/contracts';

/** 1つのRunのグループ分けの値。tagかparameterの値、または実験のIDと名前。 */
export interface RunGroupValue {
  runId: string;
  value: string | null;
  /** 値の代わりに表示するもの（実験名など）。無ければ値そのものを出す。 */
  label?: string | null;
}
export interface RunGroupAssignment {
  groupKey: string;
  label: string;
  runIds: string[];
}

const labelCollator = new Intl.Collator(undefined, { numeric: true });

// 学習率のようなparameterの値は小数で、numericのcollatorでは桁ごとに並んでしまう。
function asNumber(label: string): number | null {
  const number = label.trim() === '' ? NaN : Number(label);
  return Number.isFinite(number) ? number : null;
}

function compareLabels(left: string, right: string): number {
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber)
    return leftNumber - rightNumber;
  return labelCollator.compare(left, right);
}

/**
 * Runをリクエストの順にグループに分ける。グループはラベル順で、数値は値の順に並べ
 * （lrなら0.001、0.01、0.1）、値の無いRunは最後のグループ`(none)`になる。値が文字どおり
 * `(none)`のものもそのグループに入れ、groupKeyが一意になるようにする。
 */
export function groupRuns(values: RunGroupValue[]): RunGroupAssignment[] {
  const groups = new Map<string, RunGroupAssignment>();
  let none: RunGroupAssignment | null = null;
  for (const run of values) {
    if (run.value === null || run.value === RUN_GROUP_NONE) {
      none ??= { groupKey: RUN_GROUP_NONE, label: RUN_GROUP_NONE, runIds: [] };
      none.runIds.push(run.runId);
      continue;
    }
    let group = groups.get(run.value);
    if (!group) {
      group = { groupKey: run.value, label: run.label ?? run.value, runIds: [] };
      groups.set(run.value, group);
    }
    group.runIds.push(run.runId);
  }
  const sorted = [...groups.values()].sort(
    (left, right) =>
      compareLabels(left.label, right.label) || compareLabels(left.groupKey, right.groupKey),
  );
  return none ? [...sorted, none] : sorted;
}
