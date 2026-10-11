import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSettingsReturnScreen, rememberSettingsReturnScreen } from './settingsReturnScreen';

const STORAGE_KEY = 'mmt.settings.returnScreen';

describe('全体設定から戻るプロジェクトの画面', () => {
  let entries: Map<string, string>;
  beforeEach(() => {
    entries = new Map();
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => entries.set(key, value),
      getItem: (key: string) => entries.get(key) ?? null,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('最後に覚えたプロジェクトの画面とプロジェクト名を返す', () => {
    rememberSettingsReturnScreen({ path: '/projects/p1/jobs?status=running', projectName: '音声' });
    rememberSettingsReturnScreen({ path: '/projects/p2/experiments', projectName: '画像' });
    expect(readSettingsReturnScreen()).toEqual({
      path: '/projects/p2/experiments',
      projectName: '画像',
    });
  });

  it('何も覚えていないとき、壊れた値やプロジェクトの外を指す値のときは戻り先を出さない', () => {
    expect(readSettingsReturnScreen()).toBeNull();
    entries.set(STORAGE_KEY, '{not json');
    expect(readSettingsReturnScreen()).toBeNull();
    entries.set(STORAGE_KEY, JSON.stringify({ path: '//evil.invalid/', projectName: 'x' }));
    expect(readSettingsReturnScreen()).toBeNull();
  });

  it('ストレージが使えなくても例外を出さない', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('sessionStorage', { setItem: blocked, getItem: blocked });
    expect(() =>
      rememberSettingsReturnScreen({ path: '/projects/p1/jobs', projectName: '音声' }),
    ).not.toThrow();
    expect(readSettingsReturnScreen()).toBeNull();
  });
});
