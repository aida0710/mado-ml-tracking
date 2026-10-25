import { useSearchParams } from 'react-router-dom';
import { parseStepParam } from '../lib/mediaSteps';
import { parseStepsParam, stepsParamOf } from '../lib/mediaCompareSteps';

// メディアのタブのURLのパラメータ。リンクを開くと同じキーとstepが出る。
const KEY_PARAM = 'mediaKey';
const STEP_PARAM = 'mediaStep';
const STEPS_PARAM = 'mediaSteps';

/**
 * Runのメディアのタブ（1つのstep）と比較（stepの一覧）が出すメディアのキーとstep。Artifactの
 * ツリーのフォルダと同じくURLに持つ。変更は履歴の項目を置き換えるので、スライダーを動かしても
 * 戻るボタンの履歴が埋まらない。
 */
export function useMediaLocation() {
  const [params, setParams] = useSearchParams();
  function update(values: Record<string, string | null>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [name, value] of Object.entries(values))
          if (value === null) next.delete(name);
          else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }
  return {
    chosenKey: params.get(KEY_PARAM),
    requestedStep: parseStepParam(params.get(STEP_PARAM)),
    /** null: 既定の列。[]: 各Runの最新のstep。 */
    steps: parseStepsParam(params.get(STEPS_PARAM)),
    /** キーを変えてもstepは保つ。パネルが、そのキーで記録された最も近いstepに合わせる。 */
    setKey: (key: string) => update({ [KEY_PARAM]: key }),
    setStep: (step: number) => update({ [STEP_PARAM]: String(step) }),
    /** 新しいキーでは前のstepが無いかもしれないので、比較は既定の列に戻る。 */
    setComparedKey: (key: string) => update({ [KEY_PARAM]: key, [STEPS_PARAM]: null }),
    setSteps: (steps: number[] | null) => update({ [STEPS_PARAM]: stepsParamOf(steps) }),
  };
}
