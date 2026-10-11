import { describe, expect, it } from 'vitest';
import { runListEmptyMessage } from './runListEmptyMessage';
import { text } from '../i18n/catalog';

const base = { isNarrowed: false, experimentCount: 1, isExperimentChosen: true, canEdit: true };

describe('Runが無いときの一覧の文', () => {
  it('絞り込んで0件なら「一致しない」、絞り込まずに0件なら次にやることを出す', () => {
    expect(runListEmptyMessage({ ...base, isNarrowed: true })).toBe(text.noResults);
    expect(runListEmptyMessage(base)).toBe(text.runsNoneInExperiment);
    expect(runListEmptyMessage({ ...base, isExperimentChosen: false })).toBe(text.runsNoneInProject);
  });

  it('実験が無ければ実験を作ることを、記録できない人には誰が記録できるかを出す', () => {
    expect(runListEmptyMessage({ ...base, experimentCount: 0 })).toBe(text.experimentsNoneYet);
    expect(runListEmptyMessage({ ...base, canEdit: false })).toBe(text.runsNoneForViewer);
    expect(runListEmptyMessage({ ...base, experimentCount: 0, canEdit: false })).toBe(
      text.experimentsNoneForViewer,
    );
  });
});
