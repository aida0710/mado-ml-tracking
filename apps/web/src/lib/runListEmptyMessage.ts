import { text } from '../i18n/catalog';

/**
 * What an empty Run list says. Narrowed by a search or past the first page, nothing matched; with
 * no conditions, nothing is recorded yet, and the message names the next step for this person.
 */
export function runListEmptyMessage(state: {
  isNarrowed: boolean;
  /** How many Experiments the Project has; undefined while they load. */
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
