import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { projectFixture } from './fixtures.js';

type ProjectFixture = Awaited<ReturnType<typeof projectFixture>>;
const PUBLIC_URL = 'https://tracking.example.test';

// The mistakes people make when they first connect the SDKs (audit A-04, A-07): the error has to
// say what to change, not only that something is wrong.
describe.skipIf(!testDatabaseUrl)('接続先とtokenを間違えたときのエラー文（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: ProjectFixture;
  beforeAll(async () => {
    harness = await createHarness({ environment: { MMT_PUBLIC_URL: PUBLIC_URL } });
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await projectFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  async function personalToken(scopes: string[]): Promise<string> {
    const minted = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: scopes.join(' '), projectId: fixture.project.id, scopes },
      }),
    );
    return minted.token;
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createNativeRun = (projectId: string, token: string) =>
    request(harness.app, `/api/projects/${projectId}/runs`, {
      method: 'POST',
      headers: bearer(token),
      body: { experimentId: fixture.experiment.id, name: 'first', kind: 'training' },
    });
  const mlflowCreateRun = (headers: Record<string, string>) =>
    request(
      harness.app,
      `/api/mlflow/projects/${fixture.project.id}/api/2.0/mlflow/runs/create`,
      { method: 'POST', headers, body: { experiment_id: fixture.experiment.id } },
    );

  it('readだけのtokenで記録すると、足りないscopeと発行し直す場所・用途を返す', async () => {
    const token = await personalToken(['read']);
    const native = await createNativeRun(fixture.project.id, token);
    expect(native.status).toBe(403);
    const nativeError = (await native.json()) as { error: string; code: string };
    expect(nativeError.code).toBe('scope_required');
    expect(nativeError.error).toContain('runs:write');
    expect(nativeError.error).toContain('Issue API token');
    expect(nativeError.error).toContain('Record from SDK or MLflow 3');
    expect(nativeError).toMatchObject({ scope: 'runs:write', purpose: 'recording' });

    const mlflow = await mlflowCreateRun(bearer(token));
    expect(mlflow.status).toBe(403);
    const mlflowError = (await mlflow.json()) as { error_code: string; message: string };
    expect(mlflowError.error_code).toBe('PERMISSION_DENIED');
    expect(mlflowError.message).toContain('runs:write');
  });

  it('別のProjectへ送ると、tokenがどのProject用かを名前で返す', async () => {
    const other = await entity<Project>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Other Project', visibility: 'public' },
      }),
    );
    const token = await personalToken(['read', 'runs:write']);
    const response = await createNativeRun(other.id, token);
    expect(response.status).toBe(403);
    const failure = (await response.json()) as { error: string; code: string };
    expect(failure.code).toBe('project_forbidden');
    expect(failure.error).toContain('project "Test Project"');
    expect(failure).toMatchObject({ tokenProjectName: 'Test Project' });
    expect(failure.error).toContain('MLFLOW_TRACKING_URI');
  });

  it('MLflowでtokenを送らないと、設定するMLflowの環境変数を返す', async () => {
    const response = await mlflowCreateRun({});
    expect(response.status).toBe(401);
    const failure = (await response.json()) as { error_code: string; message: string };
    expect(failure.error_code).toBe('UNAUTHENTICATED');
    expect(failure.message).toContain('MLFLOW_TRACKING_TOKEN');
    // The native API keeps its own wording for people signing in.
    const native = await request(harness.app, `/api/projects/${fixture.project.id}/runs`, {
      method: 'POST',
      body: {},
    });
    expect(((await native.json()) as { code: string }).code).toBe('authentication_required');
  });

  it('MLFLOW_TRACKING_URIがサイトや /api/mlflow で止まっていると、ProjectのIDまで入れたURIを返す', async () => {
    const token = await personalToken(['read']);
    for (const path of [
      '/api/2.0/mlflow/experiments/get-by-name?experiment_name=x',
      '/api/mlflow/api/2.0/mlflow/experiments/get-by-name?experiment_name=x',
      '/api/api/2.0/mlflow-artifacts/artifacts/a.txt',
      '/api/mlflow/api/3.0/mlflow/traces',
    ]) {
      for (const headers of [{}, bearer(token), { Authorization: 'Basic bWFkbzpub3QtYS10b2tlbg==' }]) {
        const response = await request(harness.app, path, { headers });
        expect(response.status, path).toBe(404);
        const failure = (await response.json()) as { error_code: string; message: string };
        expect(failure.error_code, path).toBe('ENDPOINT_NOT_FOUND');
        expect(failure.message, path).toContain(`${PUBLIC_URL}/api/mlflow/projects/<project ID>`);
      }
    }
    const unknownNative = await request(harness.app, '/api/no-such-endpoint');
    expect(await unknownNative.json()).toEqual({ error: 'API route not found', code: 'not_found' });
  });
});
