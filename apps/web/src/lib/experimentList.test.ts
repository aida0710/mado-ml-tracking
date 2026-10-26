import { describe, expect, it } from 'vitest';
import { findExperimentNamed, recordedRunCount, withCreatedExperiment } from './experimentList';

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

describe('withCreatedExperiment', () => {
  const listed = [{ id: 'a', runCount: 3 }];
  const created = { id: 'new', runCount: 0 };

  it('一覧に無い作ったばかりの実験を加え、Runの数を0件と読める', () => {
    const experiments = withCreatedExperiment(listed, created);
    expect(recordedRunCount(experiments, 'new')).toBe(0);
  });

  it('一覧に入った後は一覧の値を使う', () => {
    const reloaded = [...listed, { id: 'new', runCount: 2 }];
    expect(withCreatedExperiment(reloaded, created)).toBe(reloaded);
  });

  it('一覧がまだ無いときは無いまま', () => {
    expect(withCreatedExperiment(undefined, created)).toBeUndefined();
  });
});
