import type { FormValues } from '../types/form';
import { getFieldValue, getSelectedValues } from './formValues';

/** 依存するものが変わったために、実行のフォームが外した選択。 */
export type ClearedLaunchChoice = 'codeVersion' | 'target' | 'gpus';

/**
 * 実行のフォームの編集を当てる。依存するものに合わなくなった選択だけを外し、どれを選び直せばよいかを
 * 画面が伝えられるようにする。
 * - コードバージョン: 種類かモデルバージョンが変わり、コードがそれを実行しないとき。
 * - コンピュータ（とそのGPU）: コードが変わり、コンピュータにそのRuntimeが無いとき。
 * - GPU: コンピュータが変わったとき。GPU IDは1台のコンピュータのものだから。
 */
export function applyLaunchFormChange({
  previous,
  next,
  isCodeAllowed,
  isTargetAllowed,
}: {
  previous: FormValues;
  next: FormValues;
  /** 選んだコードバージョンが、選んだ種類とモデルバージョンを実行できる。 */
  isCodeAllowed: (values: FormValues) => boolean;
  /** 選んだコンピュータに、選んだコードバージョンのRuntimeがある。 */
  isTargetAllowed: (values: FormValues) => boolean;
}): { values: FormValues; cleared: ClearedLaunchChoice[] } {
  const values = { ...next };
  const cleared: ClearedLaunchChoice[] = [];
  const changed = (name: string) => getFieldValue(previous, name) !== getFieldValue(values, name);
  if (
    getFieldValue(values, 'codeVersionId') &&
    (changed('kind') || changed('modelVersionId')) &&
    !isCodeAllowed(values)
  ) {
    values.codeVersionId = '';
    cleared.push('codeVersion');
  }
  if (getFieldValue(values, 'targetId') && changed('codeVersionId') && !isTargetAllowed(values)) {
    values.targetId = '';
    cleared.push('target');
  }
  if (changed('targetId') && getSelectedValues(values, 'gpuIds').length) {
    values.gpuIds = [];
    // コンピュータを外したと伝えれば、そのGPUも外れたことは伝わる。
    if (!cleared.includes('target')) cleared.push('gpus');
  }
  return { values, cleared };
}
