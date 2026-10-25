import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { API_ERROR_CODES } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';

const API_SOURCE_ROOT = new URL('../src/', import.meta.url).pathname;
const EDGE_TEMPLATE = new URL('../../../deploy/edge/runner-api.conf.template', import.meta.url).pathname;
// 手で書いたエラーの本文（`json({ error: ... })` や、ストリームの行の `write({ error: ... })`）は
// apiErrorBody を通らず、code や横の項目が抜ける。
const HAND_WRITTEN_ERROR_BODY = /\b(?:json|write)\(\s*\{\s*error\b/g;
// エラーの文は英語で書く。日本語の文は画面が code から作る。
const JAPANESE_MESSAGE =
  /\bmessage:\s*[`'"][^`'"]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
// 見本データ（seed/）の Run のログなどは、画面で見せる日本語の内容なので調べない。
const DEMO_CONTENT_DIRECTORY = 'seed';

function apiSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return apiSourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function matchLocations(pattern: RegExp, skippedDirectory?: string): string[] {
  const files = apiSourceFiles(API_SOURCE_ROOT).filter(
    (path) => !skippedDirectory || !relative(API_SOURCE_ROOT, path).startsWith(`${skippedDirectory}/`),
  );
  return files.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(pattern)].map(
      (match) =>
        `${relative(API_SOURCE_ROOT, path)}:${source.slice(0, match.index).split('\n').length}`,
    );
  });
}

describe('APIのエラー応答', () => {
  it('エラーの本文はすべて apiErrorBody で作り、手で { error } を書かない', () => {
    expect(matchLocations(HAND_WRITTEN_ERROR_BODY)).toEqual([]);
  });

  it('エラーの文に日本語を書かない', () => {
    expect(matchLocations(JAPANESE_MESSAGE, DEMO_CONTENT_DIRECTORY)).toEqual([]);
  });

  it('code は重複のない snake_case', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    for (const code of API_ERROR_CODES) expect(code).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
  });

  it('一覧の code はどれも API か edge が返す', () => {
    const sources = [
      ...apiSourceFiles(API_SOURCE_ROOT).map((path) => readFileSync(path, 'utf8')),
      readFileSync(EDGE_TEMPLATE, 'utf8'),
    ].join('\n');
    const unused = API_ERROR_CODES.filter(
      (code) => !sources.includes(`'${code}'`) && !sources.includes(`"${code}"`),
    );
    expect(unused).toEqual([]);
  });
});
