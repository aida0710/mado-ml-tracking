import { describe, expect, it } from 'vitest';
import {
  knownDirectoryPaths,
  knownPythonPaths,
  targetPathSuggestions,
  type DirectoryListingState,
} from './targetPathSuggestions';
import { projectsListing, setupCheckResult } from '../../tests/fixtures/computerSetup';

const nothingRead = () => undefined;

describe('作業ディレクトリとPythonの候補', () => {
  it('確認で見つかったディレクトリは書き込めるかと空きを、Pythonはバージョンを添えて出す', () => {
    expect(knownDirectoryPaths(setupCheckResult)).toEqual([
      { path: '/home/mmt', detail: '書き込める · 空き 1.0 TiB' },
      { path: '/home/mmt/projects', detail: '書き込める' },
      { path: '/data', detail: '書き込めない' },
    ]);
    expect(knownPythonPaths(setupCheckResult).map((python) => python.detail)).toEqual([
      '3.9.18',
      '3.12.3',
      'バージョン不明',
    ]);
    // A version 1 result (an older worker) has no candidates.
    expect(knownDirectoryPaths({ ...setupCheckResult, version: 1 } as never)).toEqual([]);
  });

  it('/ で終わる入力は、まだ読んでいなければ読む依頼をし、読み込み中と出す', () => {
    const suggestions = targetPathSuggestions({
      value: '/home/mmt/projects/',
      kind: 'directory',
      knownPaths: knownDirectoryPaths(setupCheckResult),
      canReadDirectories: true,
      listingOf: nothingRead,
    });
    expect(suggestions.directoryToRequest).toBe('/home/mmt/projects/');
    expect(suggestions.note).toBe('workerがディレクトリを読んでいます…');
  });

  it('名前を打っている途中では依頼せず、読んだ中身から補う', () => {
    const read: DirectoryListingState = { status: 'read', result: projectsListing };
    const listingOf = (directory: string) =>
      directory === '/home/mmt/projects/' ? read : undefined;
    const typingName = targetPathSuggestions({
      value: '/home/mmt/projects/mm',
      kind: 'directory',
      knownPaths: [],
      canReadDirectories: true,
      listingOf,
    });
    expect(typingName).toMatchObject({
      items: ['/home/mmt/projects/mmt-work/'],
      directoryToRequest: null,
    });
    expect(typingName.note).toBeUndefined();
    const notRead = targetPathSuggestions({
      value: '/opt/con',
      kind: 'directory',
      knownPaths: [],
      canReadDirectories: true,
      listingOf,
    });
    expect(notRead.directoryToRequest).toBeNull();
  });

  it('読めなかったディレクトリは理由を出し、workerが答えなければそう出す', () => {
    const missing: DirectoryListingState = {
      status: 'read',
      result: { path: '/nope', outcome: 'missing', entries: [], truncated: false },
    };
    expect(
      targetPathSuggestions({
        value: '/nope/',
        kind: 'directory',
        knownPaths: [],
        canReadDirectories: true,
        listingOf: () => missing,
      }).note,
    ).toBe('このディレクトリはありません');
    expect(
      targetPathSuggestions({
        value: '/nope/',
        kind: 'directory',
        knownPaths: [],
        canReadDirectories: true,
        listingOf: () => ({ status: 'failed' }),
      }).note,
    ).toBe('ディレクトリを読めませんでした（workerが応答しません）');
  });

  it('workerを選んでいない・未保存のコンピュータでは読む依頼をせず、確認の候補だけを出す', () => {
    const suggestions = targetPathSuggestions({
      value: '/home/',
      kind: 'directory',
      knownPaths: knownDirectoryPaths(setupCheckResult),
      canReadDirectories: false,
      listingOf: nothingRead,
    });
    expect(suggestions).toMatchObject({
      items: ['/home/mmt', '/home/mmt/projects'],
      directoryToRequest: null,
    });
    expect(suggestions.note).toBeUndefined();
  });
});
