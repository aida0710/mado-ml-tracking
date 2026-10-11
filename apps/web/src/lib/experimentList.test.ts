import { describe, expect, it } from 'vitest';
import { findExperimentNamed, recordedRunCount } from './experimentList';

const experiments = [
  { id: 'a', name: 'whisper-small', runCount: 0 },
  { id: 'b', name: 'Whisper-Large', runCount: 3 },
];

describe('実験の一覧から読むこと', () => {
  it('APIと同じく前後の空白を除いて名前を比べ、大文字小文字は区別する', () => {
    expect(findExperimentNamed(experiments, '  whisper-small ')?.id).toBe('a');
    expect(findExperimentNamed(experiments, 'whisper-large')).toBeUndefined();
    expect(findExperimentNamed(experiments, '   ')).toBeUndefined();
  });

  it('選んだ実験のRun数、選んでいなければ全実験の合計を返し、読み込み中は決めない', () => {
    expect(recordedRunCount(experiments, 'a')).toBe(0);
    expect(recordedRunCount(experiments, '')).toBe(3);
    expect(recordedRunCount([], '')).toBe(0);
    expect(recordedRunCount(undefined, '')).toBeUndefined();
  });
});
