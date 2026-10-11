import { describe, expect, it } from 'vitest';
import {
  buildMlflowConnectionSnippets,
  buildTokenUsageSnippet,
  mlflowTrackingUri,
} from './tokenUsageSnippet';

const PROJECT_ID = '0b5c7a52-6b8e-4d7a-9a58-1f7d1c2b3a4e';

describe('tokenを発行した直後の設定例', () => {
  it('tokenを含まず、read -s で1回だけ受け取って Mado SDK と MLflow の両方へ渡す', () => {
    expect(
      buildTokenUsageSnippet({
        origin: 'https://mmt.example.test/',
        projectId: PROJECT_ID,
        authentication: 'bearer',
      }),
    ).toBe(
      [
        'export MMT_API_URL=https://mmt.example.test',
        `export MMT_PROJECT_ID=${PROJECT_ID}`,
        "printf 'API token: '; read -r -s MMT_API_TOKEN; echo",
        'export MMT_API_TOKEN',
        `export MLFLOW_TRACKING_URI=https://mmt.example.test/api/mlflow/projects/${PROJECT_ID}`,
        `export MLFLOW_REGISTRY_URI=https://mmt.example.test/api/mlflow/projects/${PROJECT_ID}`,
        'export MLFLOW_TRACKING_TOKEN="$MMT_API_TOKEN"',
        '',
      ].join('\n'),
    );
  });

  it('Basicでは password に同じtokenを渡し、MLFLOW_TRACKING_TOKEN は出さない', () => {
    const snippet = buildTokenUsageSnippet({
      origin: 'http://127.0.0.1:5182',
      projectId: PROJECT_ID,
      authentication: 'basic',
    });
    expect(snippet).toContain('export MLFLOW_TRACKING_USERNAME=mado\n');
    expect(snippet).toContain('export MLFLOW_TRACKING_PASSWORD="$MMT_API_TOKEN"\n');
    expect(snippet).not.toContain('MLFLOW_TRACKING_TOKEN');
    expect(snippet.match(/read -r -s/g)).toHaveLength(1);
  });

  it('shellで特別な意味を持つ文字を含む値は single quote で囲む', () => {
    const snippet = buildTokenUsageSnippet({
      origin: 'http://host',
      projectId: "it's",
      authentication: 'bearer',
    });
    expect(snippet).toContain(`export MMT_PROJECT_ID='it'\\''s'`);
  });

  it('Project IDはURLへ埋め込むときにencodeする', () => {
    expect(mlflowTrackingUri('http://host', 'a/b')).toBe('http://host/api/mlflow/projects/a%2Fb');
  });
});

describe('MLflow 3の接続案内', () => {
  it('公開URLの末尾slashを除き、TrackingとRegistryに同じProjectのURIを使う', () => {
    const snippets = buildMlflowConnectionSnippets({
      origin: 'https://mmt.example.test//',
      projectId: PROJECT_ID,
    });
    const expected = `https://mmt.example.test/api/mlflow/projects/${PROJECT_ID}`;
    expect(snippets.trackingUri).toBe(expected);
    expect(snippets.registryUri).toBe(expected);
    expect(snippets.bearerEnvironment).toContain(`export MLFLOW_TRACKING_URI=${expected}\n`);
    expect(snippets.bearerEnvironment).toContain(`export MLFLOW_REGISTRY_URI=${expected}\n`);
  });

  it('Project IDに含まれるURLの区切り文字はencodeする', () => {
    const snippets = buildMlflowConnectionSnippets({ origin: 'http://host', projectId: 'a/b?c' });
    expect(snippets.trackingUri).toBe('http://host/api/mlflow/projects/a%2Fb%3Fc');
  });

  it('tokenは画面やshell履歴に残さず、端末から read -s で受け取る', () => {
    const snippets = buildMlflowConnectionSnippets({
      origin: 'http://host',
      projectId: PROJECT_ID,
    });
    expect(snippets.bearerEnvironment).toContain(
      "printf 'API token: '; read -r -s MLFLOW_TRACKING_TOKEN; echo\nexport MLFLOW_TRACKING_TOKEN\n",
    );
    expect(snippets.bearerEnvironment).not.toMatch(/MLFLOW_TRACKING_TOKEN=/);
  });

  it('Basicの例は password に token を受け取り、Bearerの変数は出さない', () => {
    const { basicEnvironment } = buildMlflowConnectionSnippets({
      origin: 'http://host',
      projectId: PROJECT_ID,
    });
    expect(basicEnvironment).toContain('export MLFLOW_TRACKING_USERNAME=mado\n');
    expect(basicEnvironment).toContain(
      "printf 'API token: '; read -r -s MLFLOW_TRACKING_PASSWORD; echo\nexport MLFLOW_TRACKING_PASSWORD\n",
    );
    expect(basicEnvironment).not.toContain('MLFLOW_TRACKING_TOKEN');
  });

  it('Pythonの例は接続先とtokenを環境変数から読み、コードに書かない', () => {
    const { python } = buildMlflowConnectionSnippets({
      origin: 'http://host',
      projectId: PROJECT_ID,
    });
    expect(python).toContain('import mlflow');
    expect(python).not.toContain('http://host');
    expect(python).not.toMatch(/token/i);
  });
});

describe('MLflow 3の例の実験', () => {
  it('実験を選んでいれば、その名前を set_experiment に入れる（引用符はPythonの文字列として逃がす）', () => {
    const { python } = buildMlflowConnectionSnippets({
      origin: 'http://host',
      projectId: PROJECT_ID,
      experimentName: '音声 "A" 版',
    });
    expect(python).toContain('mlflow.set_experiment("音声 \\"A\\" 版")');
  });

  it('実験を選んでいなければ、例の名前で set_experiment する', () => {
    const { python } = buildMlflowConnectionSnippets({ origin: 'http://host', projectId: PROJECT_ID });
    expect(python).toContain('mlflow.set_experiment("my-experiment")');
  });
});
