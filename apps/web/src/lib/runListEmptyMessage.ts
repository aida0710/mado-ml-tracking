import { text } from '../i18n/catalog';

/**
 * 空のRunの一覧に出す文。検索で絞ったか最初のページより先なら、一致するものが無かった。条件が
 * 無ければまだ何も記録されておらず、この利用者が次にすることを示す。
 */
export function runListEmptyMessage(state: {
  isNarrowed: boolean;
  /** ProjectにあるExperimentの数。読み込み中はundefined。 */
  experimentCount: number | undefined;
  isExperimentChosen: boolean;
  canEdit: boolean;
}): string {
  if (state.isNarrowed) return text.noResults;
  if (state.experimentCount === 0)
    return state.canEdit ? text.experimentsNoneYet : text.experimentsNoneForViewer;
  if (!state.canEdit) return text.runsNoneForViewer;
  return state.isExperimentChosen ? text.runsNoneInExperiment : text.runsNoneInProject;
}
