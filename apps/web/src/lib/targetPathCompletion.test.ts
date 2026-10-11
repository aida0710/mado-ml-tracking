import { describe, expect, it } from 'vitest';
import {
  completeFromKnownPaths,
  completeFromListing,
  directoryToRead,
  mergeSuggestions,
  MAX_PATH_SUGGESTIONS,
  splitTypedPath,
} from './targetPathCompletion';
import { projectsListing } from '../../tests/fixtures/computerSetup';

describe('コンピュータのパスの補完', () => {
  it('入力を最後の / までのディレクトリと、打ちかけの名前に分ける', () => {
    expect(splitTypedPath('/home/mmt/pro')).toEqual({ directory: '/home/mmt/', fragment: 'pro' });
    expect(splitTypedPath('~/')).toEqual({ directory: '~/', fragment: '' });
    expect(splitTypedPath('python3')).toEqual({ directory: '', fragment: 'python3' });
  });

  it('読めるディレクトリは絶対パスか ~/ で始まるものだけ', () => {
    expect(directoryToRead('/large/')).toBe('/large/');
    expect(directoryToRead('~/proj')).toBe('~/');
    expect(directoryToRead('work/')).toBeNull();
    expect(directoryToRead('python3')).toBeNull();
  });

  it('確認の候補は入力で始まるものだけを出し、空の入力では全部を出す', () => {
    const paths = ['/home/mmt', '/home/mmt/projects', '/data'];
    expect(completeFromKnownPaths(paths, '/home')).toEqual(['/home/mmt', '/home/mmt/projects']);
    expect(completeFromKnownPaths(paths, '')).toEqual(paths);
    // What is already typed adds nothing.
    expect(completeFromKnownPaths(paths, '/data')).toEqual([]);
  });

  it('読んだディレクトリの中身は、ディレクトリを / 付きで、隠しは . を打ったときだけ出す', () => {
    expect(completeFromListing('/home/mmt/projects/', projectsListing, 'directory')).toEqual([
      '/home/mmt/projects/mmt-work/',
      '/home/mmt/projects/models/',
    ]);
    expect(completeFromListing('/home/mmt/projects/m', projectsListing, 'directory')).toEqual([
      '/home/mmt/projects/mmt-work/',
      '/home/mmt/projects/models/',
    ]);
    expect(completeFromListing('/home/mmt/projects/.', projectsListing, 'directory')).toEqual([
      '/home/mmt/projects/.cache/',
    ]);
  });

  it('Pythonの補完では実行できるファイルも出し、入力した ~/ の形を保つ', () => {
    expect(completeFromListing('~/projects/', projectsListing, 'executable')).toEqual([
      '~/projects/mmt-work/',
      '~/projects/models/',
      '~/projects/run.sh',
    ]);
  });

  it('候補は重複を除き、一覧に出せる数までにする', () => {
    expect(mergeSuggestions(['/a', '/b'], ['/b', '/c'])).toEqual(['/a', '/b', '/c']);
    const many = Array.from({ length: MAX_PATH_SUGGESTIONS + 10 }, (_, index) => `/d/${index}`);
    expect(mergeSuggestions(many)).toHaveLength(MAX_PATH_SUGGESTIONS);
  });
});
