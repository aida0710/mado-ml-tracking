import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  Artifact,
  ArtifactReferences,
  AuditEventPage,
  Code,
  Dataset,
  DatasetFolderUpload,
  DatasetFolderUploadDiscard,
  Model,
  Run,
} from '@mmt/contracts';
import { ARTIFACT_REFERENCES_BATCH_LIMIT } from '@mmt/contracts';
import { projectFixture } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';

type Fixture = Awaited<ReturnType<typeof projectFixture>>;

// Folder names a folder upload writes: its start time with ':' and '.' replaced.
const FIRST_FOLDER = '2026-10-11T05-52-01-123Z';
const SECOND_FOLDER = '2026-10-11T06-10-44-001Z';

describe.skipIf(!testDatabaseUrl)('途中で止まったフォルダのアップロードと、Artifactの使われている場所（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: Fixture;
  let dataset: Dataset;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await projectFixture(harness);
    dataset = await createDataset('speech');
  });
  afterAll(async () => {
    await harness?.close();
  });

  async function createDataset(name: string): Promise<Dataset> {
    return entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
  }

  async function storeRunless(path: string, body: string): Promise<Artifact> {
    return entity<Artifact>(
      await request(harness.app, `${fixture.basePath}/artifacts?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        cookie: fixture.editor.cookie,
        binary: body,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
  }

  function folderFile(folder: string, path: string, target: Dataset = dataset): string {
    return `datasets/${target.id}/${folder}/${path}`;
  }

  // The dataset ID as the URL spells it; PostgreSQL accepts a UUID in either case.
  function folderUploadsPath(datasetId = dataset.id): string {
    return `${fixture.basePath}/datasets/${datasetId}/folder-uploads`;
  }

  async function listFolderUploads(
    cookie = fixture.viewer.cookie,
    path = folderUploadsPath(),
  ): Promise<DatasetFolderUpload[]> {
    const listed = await entity<{ items: DatasetFolderUpload[] }>(
      await request(harness.app, path, { cookie }),
      200,
    );
    return listed.items;
  }

  function discardFolderUpload(
    folder: string,
    cookie = fixture.administrator.cookie,
    path = folderUploadsPath(),
  ) {
    return request(harness.app, `${path}/${encodeURIComponent(folder)}`, { method: 'DELETE', cookie });
  }

  async function createVersion(files: { path: string; artifactId: string }[]) {
    return entity(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { content: { kind: 'artifacts', files } },
      }),
    );
  }

  async function readReferences(artifactIds: string[], cookie = fixture.viewer.cookie) {
    return request(
      harness.app,
      `${fixture.basePath}/artifact-references?artifactIds=${artifactIds.join(',')}`,
      { cookie },
    );
  }

  it('バージョンに載っていないフォルダだけを、件数・大きさ・時刻つきで新しい順に返す', async () => {
    await storeRunless(folderFile(FIRST_FOLDER, 'a/1.txt'), 'one');
    await storeRunless(folderFile(FIRST_FOLDER, 'a/2.txt'), 'two!');
    await storeRunless(folderFile(SECOND_FOLDER, 'b.txt'), 'three');
    // Not a folder upload: the SDK's own layout, a file directly below the root, a Run's file,
    // and another dataset's folder.
    await storeRunless(`datasets/${dataset.id}/train/sdk.txt`, 'sdk');
    await storeRunless(`datasets/${dataset.id}/loose.txt`, 'loose');
    const other = await createDataset('other');
    await storeRunless(folderFile(FIRST_FOLDER, 'x.txt', other), 'other');
    const run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { experimentId: fixture.experiment.id, name: 'Run', kind: 'training' },
      }),
    );
    await entity(
      await request(
        harness.app,
        `${fixture.basePath}/runs/${run.id}/artifacts?path=${encodeURIComponent(folderFile(FIRST_FOLDER, 'run.txt'))}`,
        { method: 'PUT', cookie: fixture.editor.cookie, binary: 'run' },
      ),
    );

    const listed = await listFolderUploads();

    expect(listed.map(({ folder, fileCount, totalSize }) => ({ folder, fileCount, totalSize }))).toEqual([
      { folder: SECOND_FOLDER, fileCount: 1, totalSize: 5 },
      { folder: FIRST_FOLDER, fileCount: 2, totalSize: 7 },
    ]);
    expect(listed[1]).toMatchObject({
      pathPrefix: `datasets/${dataset.id}/${FIRST_FOLDER}/`,
      firstStoredAt: expect.any(String),
      lastStoredAt: expect.any(String),
    });
  });

  it('フォルダのファイルが1件でもバージョンに載ると、そのフォルダは出なくなる', async () => {
    const first = await storeRunless(folderFile(FIRST_FOLDER, '1.txt'), 'one');
    await storeRunless(folderFile(FIRST_FOLDER, '2.txt'), 'two');

    await createVersion([{ path: '1.txt', artifactId: first.id }]);

    expect(await listFolderUploads()).toEqual([]);
  });

  it('Project adminの破棄は使われていないファイルだけを消し、使われているファイルは残して数える', async () => {
    const unused = await storeRunless(folderFile(FIRST_FOLDER, 'unused.txt'), 'unused');
    const weights = await storeRunless(folderFile(FIRST_FOLDER, 'weights.bin'), 'weights');
    const model = await entity<Model>(
      await request(harness.app, `${fixture.basePath}/models`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Model', family: 'qwen2' },
      }),
    );
    await entity(
      await request(harness.app, `${fixture.basePath}/models/${model.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { artifactId: weights.id },
      }),
    );
    const later = await storeRunless(folderFile(SECOND_FOLDER, 'later.txt'), 'later');

    expect(
      await entity<{ code: string }>(await discardFolderUpload(FIRST_FOLDER, fixture.editor.cookie), 403),
    ).toMatchObject({ code: 'project_forbidden' });
    const discarded = await entity<DatasetFolderUploadDiscard>(await discardFolderUpload(FIRST_FOLDER), 200);

    expect(discarded).toEqual({ deletedFileCount: 1, keptFileCount: 1 });
    const content = (artifact: Artifact) =>
      request(harness.app, `${fixture.basePath}/artifacts/${artifact.id}/content`, {
        cookie: fixture.viewer.cookie,
      });
    expect((await content(unused)).status).toBe(404);
    expect((await content(weights)).status).toBe(200);
    // The other attempt is untouched.
    expect((await content(later)).status).toBe(200);
    const audit = await entity<AuditEventPage>(
      await request(harness.app, `${fixture.basePath}/audit-events?action=dataset.folder_upload.delete`, {
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(audit.items[0]).toMatchObject({
      outcome: 'success',
      details: { folder: FIRST_FOLDER, deletedFileCount: 1, keptFileCount: 1 },
    });
  });

  it('URLのデータセットIDが大文字でも、同じフォルダを一覧し、破棄できる', async () => {
    const stored = await storeRunless(folderFile(FIRST_FOLDER, 'a.txt'), 'one');
    const upperCasePath = folderUploadsPath(dataset.id.toUpperCase());

    const listed = await listFolderUploads(fixture.viewer.cookie, upperCasePath);
    const discarded = await entity<DatasetFolderUploadDiscard>(
      await discardFolderUpload(FIRST_FOLDER, fixture.administrator.cookie, upperCasePath),
      200,
    );

    expect(listed).toMatchObject([{ folder: FIRST_FOLDER, pathPrefix: `datasets/${dataset.id}/${FIRST_FOLDER}/` }]);
    expect(discarded).toEqual({ deletedFileCount: 1, keptFileCount: 0 });
    const content = await request(harness.app, `${fixture.basePath}/artifacts/${stored.id}/content`, {
      cookie: fixture.viewer.cookie,
    });
    expect(content.status).toBe(404);
  });

  it('フォルダの名前がフォルダのアップロードの形でなければ422、Datasetが無ければ404', async () => {
    expect(
      await entity<{ code: string }>(await discardFolderUpload('train'), 422),
    ).toMatchObject({ code: 'invalid_request' });
    const missing = await request(
      harness.app,
      `${fixture.basePath}/datasets/00000000-0000-4000-8000-000000000000/folder-uploads`,
      { cookie: fixture.viewer.cookie },
    );
    expect(missing.status).toBe(404);
    const outsider = await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/folder-uploads`, {
      cookie: fixture.outsider.cookie,
    });
    expect(outsider.status).toBe(403);
  });

  it('使われている場所を名前つきで返し、知らないIDは除く', async () => {
    const weights = await storeRunless('model/weights.bin', 'weights');
    const sample = await storeRunless(folderFile(FIRST_FOLDER, 'clips/a.wav'), 'RIFF');
    const source = await storeRunless('code/source.zip', 'zip');
    const checkpointFile = await storeRunless('checkpoints/state.pt', 'state');
    const unused = await storeRunless('notes.txt', 'notes');
    const model = await entity<Model>(
      await request(harness.app, `${fixture.basePath}/models`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Speech Model', family: 'qwen2' },
      }),
    );
    const modelVersion = await entity<{ id: string; version: string }>(
      await request(harness.app, `${fixture.basePath}/models/${model.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { version: 'v1', artifactId: weights.id },
      }),
    );
    const datasetVersion = await entity<{ id: string; version: string }>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { version: 'v1', content: { kind: 'artifacts', files: [{ path: 'clips/a.wav', artifactId: sample.id }] } },
      }),
    );
    const code = await entity<Code>(
      await request(harness.app, `${fixture.basePath}/codes`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Trainer' },
      }),
    );
    const codeVersion = await entity<{ id: string }>(
      await request(harness.app, `${fixture.basePath}/codes/${code.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          runtime: { kind: 'python' },
          version: 'c1',
          source: { kind: 'artifact', artifactId: source.id },
          entrypoint: ['python', 'main.py'],
          supportedModelFamilies: ['qwen2'],
          taskTypes: ['training'],
        },
      }),
    );
    const run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { experimentId: fixture.experiment.id, name: 'Checkpoint Run', kind: 'training' },
      }),
    );
    const {
      rows: [checkpoint],
    } = await harness.database.query<{ id: string }>(
      `INSERT INTO run_checkpoints(project_id,run_id,step,source,artifact_ids,manifest)
       VALUES($1,$2,40,'mlflow',ARRAY[$3::uuid],'{"files":[]}') RETURNING id`,
      [fixture.project.id, run.id, checkpointFile.id],
    );

    const references = await entity<{ items: ArtifactReferences[] }>(
      await readReferences([
        weights.id,
        sample.id,
        source.id,
        checkpointFile.id,
        unused.id,
        '00000000-0000-4000-8000-000000000000',
      ]),
      200,
    );

    const byArtifact = new Map(references.items.map((item) => [item.artifactId, item]));
    expect(byArtifact.size).toBe(5);
    expect(byArtifact.get(weights.id)?.modelVersions).toEqual([
      { id: modelVersion.id, modelId: model.id, modelName: 'Speech Model', version: 'v1' },
    ]);
    expect(byArtifact.get(sample.id)?.datasetVersions).toEqual([
      { id: datasetVersion.id, datasetId: dataset.id, datasetName: 'speech', version: 'v1', path: 'clips/a.wav' },
    ]);
    expect(byArtifact.get(source.id)?.codeVersions).toEqual([
      { id: codeVersion.id, codeId: code.id, codeName: 'Trainer', version: 'c1' },
    ]);
    expect(byArtifact.get(checkpointFile.id)?.checkpoints).toEqual([
      { id: checkpoint!.id, runId: run.id, runName: 'Checkpoint Run', step: 40 },
    ]);
    expect(byArtifact.get(unused.id)).toEqual({
      artifactId: unused.id,
      modelVersions: [],
      datasetVersions: [],
      codeVersions: [],
      checkpoints: [],
    });

    // A checkpoint that is no longer retained does not keep its file, as for deletion.
    await harness.database.query('UPDATE run_checkpoints SET retained=false WHERE id=$1', [checkpoint!.id]);
    const released = await entity<{ items: ArtifactReferences[] }>(await readReferences([checkpointFile.id]), 200);
    expect(released.items[0]?.checkpoints).toEqual([]);
  });

  it('使われている場所は一度に100件までで、Projectに入れない人には断る', async () => {
    const tooMany = Array.from(
      { length: ARTIFACT_REFERENCES_BATCH_LIMIT + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(await entity<{ code: string }>(await readReferences(tooMany), 422)).toMatchObject({
      code: 'invalid_request',
    });
    const artifact = await storeRunless('notes.txt', 'notes');
    expect((await readReferences([artifact.id], fixture.outsider.cookie)).status).toBe(403);
  });
});
