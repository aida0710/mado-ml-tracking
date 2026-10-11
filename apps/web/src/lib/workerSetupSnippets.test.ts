import { describe, expect, it } from 'vitest';
import { buildWorkerSetupSnippets } from './workerSetupSnippets';

const TARGET_ID = '7d1c2b3a-4e0b-4c7a-9a58-5c7a526b8e4d';

describe('コンピュータのworkerの設定例', () => {
  const snippets = buildWorkerSetupSnippets({ origin: 'https://mmt.example.test/', targetId: TARGET_ID });

  it('systemdのinstallに、このページのURLとコンピュータのIDをそのまま入れる', () => {
    expect(snippets.service).toBe(
      [
        '~/.local/share/mado-tracking-worker/venv/bin/mado-tracking-worker install \\',
        '  --api-url https://mmt.example.test \\',
        '  --worker-id "$(hostname -s)" \\',
        `  --target-ids ${TARGET_ID}`,
        'loginctl enable-linger "$USER"',
        '',
      ].join('\n'),
    );
  });

  it('環境変数で動かす例も同じIDを MMT_WORKER_TARGET_IDS に入れ、tokenは端末から受け取る', () => {
    expect(snippets.environment).toContain(`export MMT_WORKER_TARGET_IDS=${TARGET_ID}\n`);
    expect(snippets.environment).toContain('export MMT_API_URL=https://mmt.example.test\n');
    expect(snippets.environment).toContain('export MMT_WORKER_ID="$(hostname -s)"\n');
    expect(snippets.environment).toContain(
      "printf 'Worker API token: '; read -r -s MMT_API_TOKEN; echo\nexport MMT_API_TOKEN\n",
    );
    expect(snippets.environment).not.toMatch(/MMT_API_TOKEN=/);
    expect(snippets.environment.trimEnd().split('\n').at(-1)).toBe(
      '~/.local/share/mado-tracking-worker/venv/bin/mado-tracking-worker run',
    );
  });

  it('workerは専用の仮想環境へtelemetry付きで入れる', () => {
    expect(snippets.install).toContain('python3 -m venv ~/.local/share/mado-tracking-worker/venv\n');
    expect(snippets.install).toContain(
      "~/.local/share/mado-tracking-worker/venv/bin/pip install 'mado-tracking[telemetry] @ git+",
    );
  });
});
