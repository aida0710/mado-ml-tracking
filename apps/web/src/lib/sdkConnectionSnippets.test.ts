import { describe, expect, it } from 'vitest';
import { buildSdkConnectionSnippets } from './sdkConnectionSnippets';

const PROJECT_ID = '0b5c7a52-6b8e-4d7a-9a58-1f7d1c2b3a4e';
const EXPERIMENT_ID = '4ba4c0de-1111-4a2b-8c3d-5e6f7a8b9c0d';

describe('Python SDKで記録する例', () => {
  it('実験を選んでいると、接続先・プロジェクト・実験のIDを環境変数に入れ、コードは名前だけでRunを作る', () => {
    const snippets = buildSdkConnectionSnippets({
      origin: 'https://mmt.example.test/',
      projectId: PROJECT_ID,
      experimentId: EXPERIMENT_ID,
    });
    expect(snippets.environment).toBe(
      [
        'export MMT_API_URL=https://mmt.example.test',
        `export MMT_PROJECT_ID=${PROJECT_ID}`,
        `export MMT_EXPERIMENT_ID=${EXPERIMENT_ID}`,
        "read -r -s -p 'API token: ' MMT_API_TOKEN",
        'export MMT_API_TOKEN',
        '',
      ].join('\n'),
    );
    expect(snippets.python).toContain('mado_tracking.start_run(name="first-run")');
    expect(snippets.python).not.toContain('experiment_name');
  });

  it('実験を選んでいないと、MMT_EXPERIMENT_IDを出さず、名前で実験を指定する（無ければSDKが作る）', () => {
    const snippets = buildSdkConnectionSnippets({ origin: 'http://host', projectId: PROJECT_ID });
    expect(snippets.environment).not.toContain('MMT_EXPERIMENT_ID');
    expect(snippets.environment).toContain(`export MMT_PROJECT_ID=${PROJECT_ID}\n`);
    expect(snippets.python).toContain(
      'mado_tracking.start_run(experiment_name="my-experiment", name="first-run")',
    );
  });

  it('tokenは例に書かず、端末から read -s で受け取る', () => {
    const { environment, python } = buildSdkConnectionSnippets({
      origin: 'http://host',
      projectId: PROJECT_ID,
      experimentId: EXPERIMENT_ID,
    });
    expect(environment).not.toMatch(/MMT_API_TOKEN=/);
    expect(python).not.toMatch(/token/i);
  });

  it('インストールはGitHubのpython/からtelemetry付きで仮想環境へ入れる', () => {
    const { install } = buildSdkConnectionSnippets({ origin: 'http://host', projectId: PROJECT_ID });
    expect(install).toBe(
      [
        'python3 -m venv .venv',
        ".venv/bin/pip install 'mado-tracking[telemetry] @ git+https://github.com/aida0710/mado-ml-tracking.git#subdirectory=python'",
        '',
      ].join('\n'),
    );
  });
});
