import { execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import type { Artifact, ModelVersionDetail } from '@mmt/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { projectFixture } from './fixtures.js';
import { mlflowSdkPythonPath } from './mlflow-sdk-fixtures.js';

// 0ならOSが選ぶ。SDKのテストを許された範囲のポートで動かすときは設定する。
const SDK_TEST_HTTP_PORT = Number(process.env.MMT_TEST_HTTP_PORT ?? 0);
// 公式ライブラリでの確認には、同じPython環境にscikit-learnも要る。
const hasSdkWithSklearn =
  existsSync(mlflowSdkPythonPath) &&
  spawnSync(mlflowSdkPythonPath, ['-c', 'import mlflow.sklearn, sklearn']).status === 0;
// mlflowとscikit-learnを読み込んでPythonを起動するだけで数秒かかる。
const SDK_TEST_TIMEOUT_MS = 60_000;
// MAX_MLMODEL_METADATA_BYTES（64 KiB）に余裕を足した大きさ。これほど大きいMLmodelは解析しない。
const OVERSIZED_MLMODEL_PADDING = 70 * 1024;

// MLflow 3.17.0でmlflow.sklearn.save_model()が書くもの（既定の形式はskops）。
const SKLEARN_SAVED_MODEL = {
  MLmodel: [
    'flavors:',
    '  python_function:',
    '    env:',
    '      conda: conda.yaml',
    '      virtualenv: python_env.yaml',
    '    loader_module: mlflow.sklearn',
    '    model_path: model.skops',
    '    predict_fn: predict',
    '    python_version: 3.12.14',
    '  sklearn:',
    '    code: null',
    '    pickled_model: model.skops',
    '    serialization_format: skops',
    '    sklearn_version: 1.9.1',
    '    skops_trusted_types: null',
    'mlflow_version: 3.17.0',
    'model_id: null',
    '',
  ].join('\n'),
  'conda.yaml': 'name: mlflow-env\n',
  'model.skops': 'skops-weights',
  'python_env.yaml': 'python: 3.12.14\n',
  'requirements.txt': 'scikit-learn==1.9.1\n',
};
// MLflow 3.17.0でmlflow.pytorch.save_model()が書くもの。model_dataはディレクトリを指す。
const PYTORCH_SAVED_MODEL = {
  MLmodel: [
    'flavors:',
    '  python_function:',
    '    data: data',
    '    env:',
    '      conda: conda.yaml',
    '      virtualenv: python_env.yaml',
    '    loader_module: mlflow.pytorch',
    '  pytorch:',
    '    code: null',
    '    model_data: data',
    '    pytorch_version: 2.14.1+cpu',
    'mlflow_version: 3.17.0',
    '',
  ].join('\n'),
  'conda.yaml': 'name: mlflow-env\n',
  'data/model.pt2': 'exported-program',
  'python_env.yaml': 'python: 3.12.14\n',
  'requirements.txt': 'torch==2.14.1\n',
};

type ModelVersionResponse = {
  model_version: { name: string; version: string; run_id: string; status: string; source: string };
};
type MlflowError = { error_code: string; message: string };

describe.skipIf(!testDatabaseUrl)(
  'save_model()＋log_artifacts() で Run に上げたモデルを runs:/ から登録する（公式ライブラリと同じ要求）',
  () => {
    let harness: Harness;
    let project: Awaited<ReturnType<typeof projectFixture>>;
    let token: string;
    let base: string;
    beforeAll(async () => {
      harness = await createHarness();
    });
    beforeEach(async () => {
      await harness.reset();
      project = await projectFixture(harness);
      token = await mintToken(project, project.editor.cookie, [
        'read',
        'runs:write',
        'registry:write',
        'artifacts:write',
      ]);
      base = `/api/mlflow/projects/${project.project.id}/api/2.0`;
    });
    afterAll(async () => {
      await harness?.close();
    });

    async function mintToken(
      owner: { project: { id: string } },
      cookie: string,
      scopes: string[],
    ): Promise<string> {
      const minted = await entity<{ token: string }>(
        await request(harness.app, '/api/tokens', {
          method: 'POST',
          cookie,
          body: { name: 'saved-model', projectId: owner.project.id, scopes },
        }),
      );
      return minted.token;
    }

    /**
     * mlflow.start_run() + mlflow.log_artifacts(directory, artifactPath)を、クライアントと同じ形で
     * 送る。
     */
    async function runWithSavedModel(
      files: Record<string, string>,
      options: { artifactPath?: string; apiBase?: string; token?: string } = {},
    ): Promise<string> {
      const apiBase = options.apiBase ?? base;
      const bearer = options.token ?? token;
      const created = await entity<{ run: { info: { run_id: string } } }>(
        await request(harness.app, `${apiBase}/mlflow/runs/create`, {
          method: 'POST',
          token: bearer,
          body: { experiment_id: '0', run_name: 'saved-model' },
        }),
        200,
      );
      const runId = created.run.info.run_id;
      const prefix = options.artifactPath === '' ? '' : `${options.artifactPath ?? 'model'}/`;
      for (const [file, contents] of Object.entries(files))
        await entity(
          await request(
            harness.app,
            `${apiBase}/mlflow-artifacts/artifacts/runs/${runId}/artifacts/${prefix}${file}`,
            { method: 'PUT', token: bearer, binary: contents },
          ),
          200,
        );
      return runId;
    }

    /**
     * クライアントがそこにMLmodelを見つけたあとの、
     * mlflow.register_model("runs:/<run>/model", name)。
     */
    async function registerRunDirectory(options: {
      runId: string;
      source?: string;
      name?: string;
      token?: string;
      cookie?: string;
    }): Promise<Response> {
      const name = options.name ?? 'saved-classifier';
      const auth = options.cookie ? { cookie: options.cookie } : { token: options.token ?? token };
      // register_modelは先に登録モデルを作り、既にあればそのまま進む。
      const created = await request(harness.app, `${base}/mlflow/registered-models/create`, {
        method: 'POST',
        token,
        body: { name },
      });
      if (created.status !== 200)
        expect(((await created.json()) as MlflowError).error_code).toBe('RESOURCE_ALREADY_EXISTS');
      return request(harness.app, `${base}/mlflow/model-versions/create`, {
        method: 'POST',
        ...auth,
        body: {
          name,
          source: options.source ?? `mlflow-artifacts:/runs/${options.runId}/artifacts/model`,
          run_id: options.runId,
        },
      });
    }

    async function storedVersion(version: string) {
      return (
        await harness.database.query(
          `SELECT v.id,v.artifact_id,v.source_run_id,v.metadata FROM model_versions v
          JOIN models m ON m.id=v.model_id WHERE m.project_id=$1 AND v.version=$2`,
          [project.project.id, version],
        )
      ).rows[0] as
        | {
            id: string;
            artifact_id: string;
            source_run_id: string;
            metadata: {
              mlflow: { modelFormat?: string; weightsPath?: string; artifactManifest: { path: string }[] };
            };
          }
        | undefined;
    }

    async function versionCount(): Promise<number> {
      const counted = await harness.database.query(
        'SELECT count(*)::int AS count FROM model_versions WHERE project_id=$1',
        [project.project.id],
      );
      return counted.rows[0].count;
    }

    it('scikit-learn（3.17 の model.skops）は MLmodel の pickled_model を重みにし、画面が使う詳細で重みと生成元の Run につながる', async () => {
      const runId = await runWithSavedModel(SKLEARN_SAVED_MODEL);
      const registered = await entity<ModelVersionResponse>(
        await registerRunDirectory({ runId }),
        200,
      );
      expect(registered.model_version).toMatchObject({
        version: '1',
        run_id: runId,
        status: 'READY',
      });
      const stored = await storedVersion('1');
      expect(stored?.source_run_id).toBe(runId);
      expect(stored?.metadata.mlflow.weightsPath).toBe('model.skops');
      expect(stored?.metadata.mlflow.artifactManifest.map((entry) => entry.path)).toEqual(
        Object.keys(SKLEARN_SAVED_MODEL).sort(),
      );
      // Modelsの画面は、バージョンの詳細を読み、次に重みのArtifactをidで読む。
      const detail = await entity<ModelVersionDetail>(
        await request(
          harness.app,
          `${project.basePath}/model-versions/${stored!.id}`,
          { cookie: project.viewer.cookie },
        ),
        200,
      );
      expect(detail.version.sourceRunId).toBe(runId);
      const weights = await entity<Artifact>(
        await request(harness.app, `${project.basePath}/artifacts/${detail.version.artifactId}`, {
          cookie: project.viewer.cookie,
        }),
        200,
      );
      expect(weights).toMatchObject({ runId, path: 'model/model.skops' });
      const downloaded = await request(
        harness.app,
        `${base}/mlflow-artifacts/artifacts/model-versions/${stored!.id}/artifacts/model.skops`,
        { token },
      );
      expect(await downloaded.text()).toBe('skops-weights');
    });

    it('PyTorch（3.17 の data/model.pt2）は MLmodel が指すディレクトリを含むモデル一式として登録され、create_model_version の runs:/ でも通る', async () => {
      const runId = await runWithSavedModel(PYTORCH_SAVED_MODEL);
      await entity(await registerRunDirectory({ runId, source: `runs:/${runId}/model` }), 200);
      const stored = await storedVersion('1');
      expect(stored?.metadata.mlflow.modelFormat).toBe('mlflow');
      expect(stored?.metadata.mlflow.artifactManifest.map((entry) => entry.path)).toContain(
        'data/model.pt2',
      );
      const downloaded = await request(
        harness.app,
        `${base}/mlflow-artifacts/artifacts/model-versions/${stored!.id}/artifacts/data/model.pt2`,
        { token },
      );
      expect(await downloaded.text()).toBe('exported-program');
    });

    it('MLmodel が既定の名前でないファイルを指すときは、同じディレクトリの model.pkl ではなく MLmodel の指すファイルを重みにする', async () => {
      const runId = await runWithSavedModel({
        MLmodel: 'flavors:\n  sklearn:\n    pickled_model: weights/classifier.bin\n',
        'weights/classifier.bin': 'described-weights',
        'model.pkl': 'unrelated-pickle',
      });
      await entity(await registerRunDirectory({ runId }), 200);
      expect((await storedVersion('1'))?.metadata.mlflow.weightsPath).toBe('weights/classifier.bin');
    });

    it('Run の直下に上げたモデル（runs:/<run>/ はライブラリが Run の Artifact の根元として送る）も登録できる', async () => {
      const runId = await runWithSavedModel(SKLEARN_SAVED_MODEL, { artifactPath: '' });
      await entity(
        await registerRunDirectory({ runId, source: `mlflow-artifacts:/runs/${runId}/artifacts` }),
        200,
      );
      expect((await storedVersion('1'))?.metadata.mlflow.weightsPath).toBe('model.skops');
    });

    it('MLmodel が読み取りの上限を超えるときは、既定のファイル名（model.skops）から重みを選ぶ', async () => {
      const runId = await runWithSavedModel({
        ...SKLEARN_SAVED_MODEL,
        MLmodel: `${SKLEARN_SAVED_MODEL.MLmodel}metadata:\n  notes: ${'x'.repeat(OVERSIZED_MLMODEL_PADDING)}\n`,
      });
      await entity(await registerRunDirectory({ runId }), 200);
      expect((await storedVersion('1'))?.metadata.mlflow.weightsPath).toBe('model.skops');
    });

    it('保存先から MLmodel を読めないときは、推測で重みを選ばずバージョンを作らない', async () => {
      const runId = await runWithSavedModel(SKLEARN_SAVED_MODEL);
      const descriptor = (
        await harness.database.query(
          "SELECT storage_key FROM artifacts WHERE run_id=$1 AND path='model/MLmodel'",
          [runId],
        )
      ).rows[0] as { storage_key: string };
      await rm(path.join(harness.artifactDirectory, descriptor.storage_key));
      const refused = await registerRunDirectory({ runId });
      expect(refused.status).toBe(404);
      expect(((await refused.json()) as MlflowError).error_code).toBe('RESOURCE_DOES_NOT_EXIST');
      expect(await versionCount()).toBe(0);
    });

    it('メンバーでない人、viewer、read だけの token、別の Project の Run からは登録できず、バージョンを作らない', async () => {
      const runId = await runWithSavedModel(SKLEARN_SAVED_MODEL);
      const asOutsider = await registerRunDirectory({ runId, cookie: project.outsider.cookie });
      expect(asOutsider.status).toBe(403);
      expect(((await asOutsider.json()) as MlflowError).error_code).toBe('PERMISSION_DENIED');
      const asViewer = await registerRunDirectory({ runId, cookie: project.viewer.cookie });
      expect(asViewer.status).toBe(403);
      expect(((await asViewer.json()) as MlflowError).error_code).toBe('PERMISSION_DENIED');
      const readToken = await mintToken(project, project.editor.cookie, ['read']);
      const withReadToken = await registerRunDirectory({ runId, token: readToken });
      expect(withReadToken.status).toBe(403);
      expect(((await withReadToken.json()) as MlflowError).error_code).toBe('PERMISSION_DENIED');

      const otherProject = await entity<{ id: string }>(
        await request(harness.app, '/api/projects', {
          method: 'POST',
          cookie: project.administrator.cookie,
          body: { name: 'Other Project', visibility: 'private' },
        }),
      );
      const otherToken = await mintToken({ project: otherProject }, project.administrator.cookie, [
        'read',
        'runs:write',
        'artifacts:write',
      ]);
      const otherRunId = await runWithSavedModel(SKLEARN_SAVED_MODEL, {
        apiBase: `/api/mlflow/projects/${otherProject.id}/api/2.0`,
        token: otherToken,
      });
      const fromOtherProject = await registerRunDirectory({ runId: otherRunId });
      expect(fromOtherProject.status).toBe(404);
      expect(((await fromOtherProject.json()) as MlflowError).error_code).toBe(
        'RESOURCE_DOES_NOT_EXIST',
      );
      expect(await versionCount()).toBe(0);
    });

    it.skipIf(!hasSdkWithSklearn)(
      '公式ライブラリの save_model()＋log_artifacts()＋register_model() がそのまま通り、load_model の予測が保存前と同じ',
      async () => {
        const server = serve({
          fetch: harness.app.fetch,
          hostname: '127.0.0.1',
          port: SDK_TEST_HTTP_PORT,
        });
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        try {
          const { port } = server.address() as AddressInfo;
          const script = [
            'import json, tempfile, mlflow, numpy as np',
            'from pathlib import Path',
            'from sklearn.linear_model import LinearRegression',
            'model = LinearRegression().fit(np.array([[0.0], [1.0]]), np.array([1.0, 3.0]))',
            'directory = Path(tempfile.mkdtemp()) / "model"',
            'mlflow.sklearn.save_model(model, str(directory))',
            'with mlflow.start_run() as run:',
            '    mlflow.log_artifacts(str(directory), "model")',
            'version = mlflow.register_model(f"runs:/{run.info.run_id}/model", "sdk-saved")',
            'loaded = mlflow.pyfunc.load_model("models:/sdk-saved/1")',
            'print(json.dumps({',
            '  "version": str(version.version),',
            '  "sameRun": version.run_id == run.info.run_id,',
            '  "samePrediction": loaded.predict(np.array([[2.0]])).tolist() == model.predict(np.array([[2.0]])).tolist(),',
            '}))',
          ].join('\n');
          const result = await promisify(execFile)(mlflowSdkPythonPath, ['-c', script], {
            env: {
              ...process.env,
              MLFLOW_TRACKING_URI: `http://127.0.0.1:${port}/api/mlflow/projects/${project.project.id}`,
              MLFLOW_TRACKING_TOKEN: token,
              MLFLOW_HTTP_REQUEST_MAX_RETRIES: '0',
              MLFLOW_DISABLE_AGENT_HINT: '1',
            },
          });
          expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({
            version: '1',
            sameRun: true,
            samePrediction: true,
          });
        } finally {
          await new Promise((resolve) => server.close(resolve));
        }
      },
      SDK_TEST_TIMEOUT_MS,
    );
  },
);
