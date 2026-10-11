import { describe, expect, it } from 'vitest';
import { buildSubmitCliSetupSnippets, SUBMIT_TOKEN_SCOPES } from './submitCliSetup';

describe('手動投入の準備', () => {
  const snippets = buildSubmitCliSetupSnippets('https://mmt.example.test/');

  it('接続先はこのページのURLで、tokenは例に書かず端末から受け取る', () => {
    expect(snippets.environment).toBe(
      [
        'export MMT_API_URL=https://mmt.example.test',
        "read -r -s -p 'API token: ' MMT_API_TOKEN",
        'export MMT_API_TOKEN',
        '',
      ].join('\n'),
    );
  });

  it('mado-trackingをホームの仮想環境へ入れ、次からもコマンドが見つかるようPATHに足す', () => {
    expect(snippets.install).toContain('python3 -m venv ~/.venvs/mado-tracking\n');
    expect(snippets.install).toContain(
      "~/.venvs/mado-tracking/bin/pip install 'mado-tracking @ git+https://github.com/aida0710/mado-ml-tracking.git#subdirectory=python'\n",
    );
    expect(snippets.install).toContain('export PATH="$HOME/.venvs/mado-tracking/bin:$PATH"\n');
  });

  it('投入用のtokenは、Jobを取るjobs:writeと件数を読むreadで発行する', () => {
    expect([...SUBMIT_TOKEN_SCOPES].sort()).toEqual(['jobs:write', 'read']);
  });
});
