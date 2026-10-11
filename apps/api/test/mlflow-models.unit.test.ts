import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { mlflowSdkPythonPath } from './mlflow-sdk-fixtures.js';
import { compileFilter, SqlParameters } from '../src/mlflow/models/searchSyntax.js';
import { cutPage, requestedPage } from '../src/mlflow/models/searchPagination.js';
import { MAX_MODEL_PAGE_SIZE } from '../src/mlflow/models/limits.js';
import {
  loggedModelProtocol,
  modelVersionProtocol,
  registeredModelProtocol,
  latestVersions,
} from '../src/mlflow/models/protocol.js';
import { selectWeightsArtifact } from '../src/mlflow/models/modelManifest.js';
import type { SavedModelArtifacts } from '../src/mlflow/models/types.js';
import type {
  LoggedModelRecord,
  ModelVersionRecord,
  RegisteredModelRecord,
} from '../src/mlflow/models/types.js';

const timestamp = '2026-10-08T01:00:00.000Z';
const loggedModel: LoggedModelRecord = {
  id: 'm-12345678123412341234123456789012',
  projectId: '12345678-1234-4234-8234-123456789012',
  experimentId: '12345678-1234-4234-8234-123456789013',
  sourceRunId: '12345678-1234-4234-8234-123456789014',
  name: 'Classifier',
  modelType: 'sklearn',
  status: 'READY',
  params: { alpha: '1' },
  tags: { framework: 'sklearn' },
  metadata: {},
  createdBy: '12345678-1234-4234-8234-123456789015',
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
};
const version: ModelVersionRecord = {
  id: '12345678-1234-4234-8234-123456789016',
  modelId: '12345678-1234-4234-8234-123456789017',
  projectId: loggedModel.projectId,
  name: 'Classifier',
  version: '1',
  family: 'sklearn',
  sourceRunId: loggedModel.sourceRunId,
  parentModelVersionIds: [],
  weightsUri: '/api/projects/project/artifacts/weights/content',
  artifactId: '12345678-1234-4234-8234-123456789018',
  defaultCodeVersionId: null,
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp,
  description: 'Test classifier',
  tags: { reviewed: 'true' },
  runLink: '',
  currentStage: 'None',
  artifactUri: 'mlflow-artifacts:/model-versions/12345678-1234-4234-8234-123456789016/artifacts',
  loggedModelId: loggedModel.id,
  aliases: ['champion'],
  deletedAt: null,
};
const registeredModel: RegisteredModelRecord = {
  id: version.modelId,
  projectId: loggedModel.projectId,
  name: version.name,
  family: version.family,
  description: '',
  createdAt: timestamp,
  updatedAt: timestamp,
  tags: { team: 'ml' },
  deletedAt: null,
};

describe('MLflowモデルの検索・保存・公式protocol', () => {
  it('引用文字列のANDとSQL文字列を値として扱い、SQLの構造へ混ぜない', () => {
    const parameters = new SqlParameters();
    const filter = compileFilter({
      filter: "name = 'a AND b''; DROP TABLE models; --' AND name ILIKE '%classifier%'",
      parameters,
      resolveField: () => ({ expression: 'm.name', numeric: false }),
    });
    expect(filter).toBe('m.name = $1 AND m.name ILIKE $2');
    expect(parameters.values).toEqual(["a AND b'; DROP TABLE models; --", '%classifier%']);
  });

  it('未知のORや未対応構文、型不一致を黙って無視せず拒否する', () => {
    for (const filter of [
      "name = 'a' OR name = 'b'",
      "name IN ('a')",
      'name > 1',
      "name = 'a' AND",
      "name = 'unterminated",
    ]) {
      expect(() =>
        compileFilter({
          filter,
          parameters: new SqlParameters(),
          resolveField: () => ({ expression: 'm.name', numeric: false }),
        }),
      ).toThrow();
    }
  });

  it('page_tokenを検索条件に結び付け、条件が変わったtokenを拒否する', () => {
    const query = { projectId: 'one', filter: 'same' };
    const first = requestedPage({ query, pageToken: undefined, maxResults: 5 });
    const token = cutPage([1, 2, 3, 4, 5, 6], first).continuation.next_page_token;
    expect(requestedPage({ query, pageToken: token, maxResults: 5 }).offset).toBe(5);
    expect(() =>
      requestedPage({
        query: { projectId: 'two', filter: 'same' },
        pageToken: token,
        maxResults: 5,
      }),
    ).toThrow();
    expect(() => requestedPage({ query, pageToken: 'invalid-token', maxResults: 5 })).toThrow();
  });

  it('page_tokenは次のページで件数を変えても使える（SDKは残りの件数で次を頼む）', () => {
    const query = { projectId: 'one', filter: 'same' };
    const first = requestedPage({ query, pageToken: undefined, maxResults: 2 });
    const token = cutPage(['a', 'b', 'c'], first).continuation.next_page_token;
    expect(requestedPage({ query, pageToken: token, maxResults: 7 })).toMatchObject({
      offset: 2,
      size: 7,
    });
  });

  it('上限を超える件数は上限で切り、残りがあれば続きのページの印を返す', () => {
    const page = requestedPage({ query: {}, pageToken: undefined, maxResults: 10000 });
    expect(page.size).toBe(MAX_MODEL_PAGE_SIZE);
    const rows = Array.from({ length: MAX_MODEL_PAGE_SIZE + 1 }, (_, index) => index);
    const cut = cutPage(rows, page);
    expect(cut.items).toHaveLength(MAX_MODEL_PAGE_SIZE);
    expect(cut.continuation.next_page_token).toEqual(expect.any(String));
    expect(cutPage(rows.slice(0, MAX_MODEL_PAGE_SIZE), page).continuation).toEqual({});
  });

  it('バージョンの番号はMLflowと同じく引用符付きの整数でも比べられ、小数や文字は断る', () => {
    const versionNumber = { expression: 'v.number', numeric: true, acceptsQuotedInteger: true };
    const parameters = new SqlParameters();
    const resolveField = () => versionNumber;
    expect(compileFilter({ filter: "version_number = '3'", parameters, resolveField })).toBe(
      'v.number = $1',
    );
    expect(parameters.values).toEqual(['3']);
    for (const filter of ["version_number = '3.5'", "version_number = 'x'"])
      expect(() =>
        compileFilter({ filter, parameters: new SqlParameters(), resolveField }),
      ).toThrow();
    expect(() =>
      compileFilter({
        filter: "creation_timestamp = '3'",
        parameters: new SqlParameters(),
        resolveField: () => ({ expression: 'm.created', numeric: true }),
      }),
    ).toThrow();
  });

  it('複数の重み候補は拒否し、mmt.weights_pathで保存済みの一つだけを選ぶ', () => {
    const saved: SavedModelArtifacts = {
      artifactUri: 'unused',
      sourceRunId: null,
      loggedModelId: null,
      metadata: {},
      tags: {},
      manifest: [
        { path: 'MLmodel', artifactId: 'description', sha256: 'a', size: 1 },
        { path: 'model.pkl', artifactId: 'weights-one', sha256: 'b', size: 10 },
        { path: 'python_model.pkl', artifactId: 'weights-two', sha256: 'c', size: 20 },
      ],
    };
    expect(() => selectWeightsArtifact(saved, {})).toThrow();
    expect(
      selectWeightsArtifact(saved, { 'mmt.weights_path': 'python_model.pkl' }).artifactId,
    ).toBe('weights-two');
    for (const path of [
      '../model.pkl',
      '/model.pkl',
      'https://example.test/file',
      'missing.pkl',
      'MLmodel',
    ])
      expect(() => selectWeightsArtifact(saved, { 'mmt.weights_path': path })).toThrow();
  });

  it('MLmodelの標準と異なるweights名をflavor定義から選ぶ', () => {
    const saved: SavedModelArtifacts = {
      artifactUri: 'unused',
      sourceRunId: null,
      loggedModelId: null,
      tags: {},
      metadata: { mlmodel: { flavors: { sklearn: { pickled_model: 'trained/custom.pkl' } } } },
      manifest: [
        { path: 'MLmodel', artifactId: 'description', sha256: 'a', size: 1 },
        { path: 'trained/custom.pkl', artifactId: 'weights', sha256: 'b', size: 10 },
      ],
    };
    expect(selectWeightsArtifact(saved, {}).path).toBe('trained/custom.pkl');
  });

  it('数字バージョンの最新は文字列順や作成時刻ではなくバージョン番号で選ぶ', () => {
    expect(
      latestVersions([
        { ...version, version: '2' },
        { ...version, version: '10', createdAt: '2026-10-07T00:00:00Z' },
      ])[0]?.version,
    ).toBe('10');
  });

  it.skipIf(!existsSync(mlflowSdkPythonPath))(
    '公式MLflow 3のprotobufとentityがサーバーのJSONをそのまま読み取れる',
    () => {
      const payload = {
        logged: loggedModelProtocol(loggedModel, [
          {
            key: 'loss',
            value: NaN,
            timestampMs: '1791410400000',
            step: '1',
            modelId: loggedModel.id,
            runId: loggedModel.sourceRunId!,
            datasetName: 'validation',
            datasetDigest: 'v1',
          },
        ]),
        registered: registeredModelProtocol(registeredModel, [version]),
        version: modelVersionProtocol(version),
      };
      const script = `import json,math,sys
from google.protobuf.json_format import ParseDict
from mlflow.protos import service_pb2,model_registry_pb2
from mlflow.entities import LoggedModel
from mlflow.entities.model_registry import RegisteredModel,ModelVersion
payload=json.load(sys.stdin)
logged=LoggedModel.from_proto(ParseDict(payload['logged'],service_pb2.LoggedModel()))
registered=RegisteredModel.from_proto(ParseDict(payload['registered'],model_registry_pb2.RegisteredModel()))
version=ModelVersion.from_proto(ParseDict(payload['version'],model_registry_pb2.ModelVersion()))
assert logged.status.value=='READY'
assert math.isnan(logged.metrics[0].value)
assert logged.metrics[0].dataset_name=='validation'
assert registered.aliases=={'champion':'1'}
assert version.status=='READY'
print(json.dumps({'logged_id':logged.model_id,'version':version.version,'source':version.source}))
`;
      const execution = spawnSync(mlflowSdkPythonPath, ['-c', script], {
        encoding: 'utf8',
        input: JSON.stringify(payload),
        env: { ...process.env, MLFLOW_DISABLE_AGENT_HINT: '1' },
      });
      expect(execution.status, execution.stderr).toBe(0);
      expect(JSON.parse(execution.stdout)).toEqual({
        logged_id: loggedModel.id,
        version: '1',
        source: version.artifactUri,
      });
    },
  );
});
