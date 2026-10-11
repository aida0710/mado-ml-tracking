import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { joinLines, promptedSecretLines } from './shellSnippet';

describe('端末からtokenを受け取る行', () => {
  it('bashで実行すると「API token:」と聞き、入力を表示せずに環境変数へ入れる', () => {
    const script = `${joinLines(promptedSecretLines('MMT_API_TOKEN'))}printf '[%s]' "$MMT_API_TOKEN"`;
    const output = execFileSync('bash', ['-c', script], { input: 'mmt_secret\n', encoding: 'utf8' });
    expect(output).toBe('API token: \n[mmt_secret]');
  });

  it('zshでは read -p が「coprocessから読む」になるため、read に -p を付けない', () => {
    const [readLine] = promptedSecretLines('MMT_API_TOKEN', 'Worker API token');
    expect(readLine).toBe("printf 'Worker API token: '; read -r -s MMT_API_TOKEN; echo");
    expect(readLine).not.toMatch(/read [^;]*-[a-z]*p/);
  });
});
