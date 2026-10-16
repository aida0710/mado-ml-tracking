import { describe, expect, it } from 'vitest';
import { workerClaimSchema, workerResumeSchema, jobListQuerySchema, codeVersionSchema } from '../src/domain/validation.js';
import { workerOutputsSchema } from '../src/domain/workerOutputValidation.js';
import { runnerOutputsSchema } from '../src/domain/siteExecutionValidation.js';
import { targetCheckResultSchema } from '../src/domain/targetCheckValidation.js';
import { datasetListQuerySchema } from '../src/domain/registryLifecycleValidation.js';
import { artifactCatalogQuerySchema, runArtifactQuerySchema } from '../src/routes/artifactRoutes.js';
import { parse } from '../src/http/request.js';
import { workerInfo } from './workerFixtures.js';

const ID = '00000000-0000-4000-8000-000000000001';
const dataset = { index: 0, kind: 'dataset', datasetId: ID, path: 'prepared' };

describe('現行のAPI入力契約', () => {
  it('claimとresumeでworker情報が欠損すると422になる', () => {
    for (const schema of [workerClaimSchema, workerResumeSchema]) {
      expect(schema.safeParse({ workerId: 'host' }).success).toBe(false);
      for (const field of Object.keys(workerInfo)) {
        const incomplete = Object.fromEntries(Object.entries(workerInfo).filter(([key]) => key !== field));
        expect(() => parse(schema, { workerId: 'host', workerInfo: incomplete }), field).toThrow();
      }
      expect(schema.safeParse({ workerId: 'host', workerInfo }).success).toBe(true);
    }
  });

  it('出力のversionが1または欠損なら理由を示して拒否する', () => {
    for (const version of [1, undefined]) {
      const outputs = { version, declarations: [dataset] };
      for (const submit of [
        () => parse(workerOutputsSchema, { ...outputs, leaseId: ID }),
        () => parse(runnerOutputsSchema, { ...outputs, instanceId: ID }),
      ]) expect(submit).toThrow('version 2が必要です。version 1は処理できません');
    }
  });

  it('path形式のDatasetはdigestを拒否しuri形式はdigestを必須にする', () => {
    const request = (declaration: object) => workerOutputsSchema.safeParse({ version: 2, leaseId: ID, declarations: [declaration] });
    expect(request(dataset).success).toBe(true);
    expect(request({ ...dataset, digest: 'ignored' }).success).toBe(false);
    const reference = { index: 0, kind: 'dataset', datasetId: ID, uri: 's3://bucket/data' };
    expect(request(reference).success).toBe(false);
    expect(request({ ...reference, digest: 'sha256:data' }).success).toBe(true);
  });

  it('接続診断はversion2の全項目を必要とする', () => {
    const result = { version: 2, items: [{ name: 'connection', status: 'ok', code: null, detail: null }], gpus: null, runtimeKinds: [], workDirectoryFreeBytes: null,
      host: { machine: null, cpuArch: null, cpuCount: null, memoryTotalBytes: null, homeDirectory: null },
      pythons: [], directories: [] };
    expect(targetCheckResultSchema.safeParse(result).success).toBe(true);
    expect(targetCheckResultSchema.safeParse({ ...result, version: 1 }).success).toBe(false);
    const { host: _host, ...incomplete } = result;
    expect(targetCheckResultSchema.safeParse(incomplete).success).toBe(false);
  });

  it('一覧の未知queryは拒否し、省略時はDatasetとProjectのArtifactは全件、RunのArtifactは最新にする', () => {
    for (const schema of [datasetListQuerySchema, jobListQuerySchema, artifactCatalogQuerySchema, runArtifactQuerySchema])
      expect(schema.safeParse({ unknown: 'value' }).success).toBe(false);
    expect(datasetListQuerySchema.parse({})).toEqual({});
    expect(datasetListQuerySchema.safeParse({ q: 'text' }).success).toBe(false);
    expect(artifactCatalogQuerySchema.parse({}).versions).toBe('all');
    expect(runArtifactQuerySchema.parse({}).versions).toBe('latest');
  });

  it('CodeVersionのruntimeを省略すると拒否する', () => {
    const code = { supportedModelFamilies: ['linear'], taskTypes: ['training'], version: '1', entrypoint: ['python', 'main.py'], source: { kind: 'inline', files: { 'main.py': 'pass' } } };
    expect(codeVersionSchema.safeParse(code).success).toBe(false);
    expect(codeVersionSchema.safeParse({ ...code, runtime: { kind: 'python' } }).success).toBe(true);
  });
});
