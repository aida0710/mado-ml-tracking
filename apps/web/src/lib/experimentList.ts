import type { Experiment } from '@mmt/contracts';

/**
 * 一覧にある、この名前のExperiment。APIが名前を保存するときと同じく、前後の空白を除き、大文字と
 * 小文字は区別して比べる。削除したExperimentは一覧に出ないので、ここで見つからない名前でも
 * APIが断ることがある。
 */
export function findExperimentNamed<T extends Pick<Experiment, 'name'>>(
  experiments: readonly T[],
  name: string,
): T | undefined {
  const wanted = name.trim();
  if (!wanted) return undefined;
  return experiments.find((experiment) => experiment.name === wanted);
}

/**
 * 選んだExperimentに記録された、削除されていないRunの数。何も選んでいなければ全Experimentの合計。
 * Experimentの一覧が届くまではundefinedにして、読み込み中の一覧からは何も決めない。
 */
export function recordedRunCount(
  experiments: readonly Pick<Experiment, 'id' | 'runCount'>[] | undefined,
  experimentId: string,
): number | undefined {
  if (!experiments) return undefined;
  if (experimentId)
    return experiments.find((experiment) => experiment.id === experimentId)?.runCount;
  return experiments.reduce((total, experiment) => total + experiment.runCount, 0);
}

/**
 * 作ったばかりの実験を、読み直した一覧が届くまで一覧に加えて扱う。一覧に入ったら一覧の値を使う。
 * 作った直後に選ばれた実験のRunの数が分からず、0件なのに無い扱いになるのを防ぐ。
 */
export function withCreatedExperiment<Item extends Pick<Experiment, 'id'>>(
  experiments: readonly Item[] | undefined,
  created: Item | null,
): readonly Item[] | undefined {
  if (!experiments || !created || experiments.some((experiment) => experiment.id === created.id))
    return experiments;
  return [...experiments, created];
}
