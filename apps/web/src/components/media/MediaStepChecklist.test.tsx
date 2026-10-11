import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MEDIA_COMPARE_MAX_STEPS } from '@mmt/contracts';
import { MediaStepChecklist } from './MediaStepChecklist';

const noop = () => undefined;

describe('MediaStepChecklist', () => {
  it('記録のあるstepだけを並べ、一部のRunにしか無いstepには記録したRunの数を添える', () => {
    const html = renderToStaticMarkup(
      <MediaStepChecklist legend="比較するstep" stepsByRun={[[9, 19], [9, 19, 29]]} selected={[19]} onChange={noop} />,
    );
    const labels = [...html.matchAll(/<span class="mono">(\d+)<\/span>/g)].map((match) => Number(match[1]));
    expect(labels).toEqual([9, 19, 29]);
    expect(html.match(/media-step-coverage">([^<]+)</g)).toEqual(['media-step-coverage">1/2 Run<']);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('このキーを記録していないRunは数に入れず、全stepに「一部」の印を付けない', () => {
    const html = renderToStaticMarkup(
      <MediaStepChecklist legend="比べるstep" stepsByRun={[[9, 19], [], [9, 19]]} selected={[]} onChange={noop} />,
    );
    expect(html).not.toContain('media-step-coverage');
  });

  it('上限まで選ぶと、残りのstepは選べなくなり、上限を知らせる', () => {
    const steps = Array.from({ length: MEDIA_COMPARE_MAX_STEPS + 1 }, (_, index) => index);
    const html = renderToStaticMarkup(
      <MediaStepChecklist legend="比較するstep" stepsByRun={[steps]} selected={steps.slice(0, MEDIA_COMPARE_MAX_STEPS)} onChange={noop} />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain(`比較できるstepは${MEDIA_COMPARE_MAX_STEPS}個までです。`);
  });
});
