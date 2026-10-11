import { describe, expect, it } from 'vitest';
import { idsOfSharedNames, isProjectNameTaken } from './projectNameCollisions';

describe('同じ名前のプロジェクト', () => {
  it('全角半角・大文字小文字・前後の空白が違うだけの名前も、同じ名前とみなす', () => {
    const existing = ['E点検Private', 'Speech'];
    expect(isProjectNameTaken('E点検Private', existing)).toBe(true);
    expect(isProjectNameTaken(' Ｅ点検private ', existing)).toBe(true);
    expect(isProjectNameTaken('speech', existing)).toBe(true);
    expect(isProjectNameTaken('Speech v2', existing)).toBe(false);
    expect(isProjectNameTaken('  ', existing)).toBe(false);
  });

  it('名前が重なっているプロジェクトだけを返す', () => {
    const projects = [
      { id: 'a', name: '音声認識の実験' },
      { id: 'b', name: '画像' },
      { id: 'c', name: '音声認識の実験 ' },
    ];
    expect([...idsOfSharedNames(projects)].sort()).toEqual(['a', 'c']);
    expect(idsOfSharedNames([{ id: 'b', name: '画像' }]).size).toBe(0);
  });
});
