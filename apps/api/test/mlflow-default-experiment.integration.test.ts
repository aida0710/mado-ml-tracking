import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { projectFixture } from './fixtures.js';

type ExperimentResponse = {
  experiment: { experiment_id: string; name: string; lifecycle_stage: string };
};

describe.skipIf(!testDatabaseUrl)(
  '新しい Project で最初の Run の前に Default Experiment（"0"）を読む',
  () => {
    let harness: Harness;
    let project: Awaited<ReturnType<typeof projectFixture>>;
    let base: string;
    beforeAll(async () => {
      harness = await createHarness();
    });
    beforeEach(async () => {
      await harness.reset();
      project = await projectFixture(harness);
      base = `/api/mlflow/projects/${project.project.id}/api/2.0/mlflow`;
    });
    afterAll(async () => {
      await harness?.close();
    });

    async function defaultExperimentRows(): Promise<number> {
      const counted = await harness.database.query(
        "SELECT count(*)::int AS count FROM experiments WHERE project_id=$1 AND name='Default'",
        [project.project.id],
      );
      return counted.rows[0].count;
    }

    it('get_experiment("0") は空の Default を返し、読んだだけでは Default を作らない', async () => {
      const read = await entity<ExperimentResponse>(
        await request(harness.app, `${base}/experiments/get?experiment_id=0`, {
          cookie: project.viewer.cookie,
        }),
        200,
      );
      expect(read.experiment).toMatchObject({
        experiment_id: '0',
        name: 'Default',
        lifecycle_stage: 'active',
      });
      expect(await defaultExperimentRows()).toBe(0);
    });

    it('search_runs と search_logged_models は "0" を 0 件として答え、最初の Run の後はその Run を返す', async () => {
      const runs = await entity<{ runs?: unknown[] }>(
        await request(harness.app, `${base}/runs/search`, {
          method: 'POST',
          cookie: project.viewer.cookie,
          body: { experiment_ids: ['0'] },
        }),
        200,
      );
      expect(runs.runs ?? []).toEqual([]);
      const models = await entity<{ models?: unknown[] }>(
        await request(harness.app, `${base}/logged-models/search`, {
          method: 'POST',
          cookie: project.viewer.cookie,
          body: { experiment_ids: ['0'] },
        }),
        200,
      );
      expect(models.models ?? []).toEqual([]);

      const created = await entity<{ run: { info: { run_id: string; experiment_id: string } } }>(
        await request(harness.app, `${base}/runs/create`, {
          method: 'POST',
          cookie: project.editor.cookie,
          body: { experiment_id: '0' },
        }),
        200,
      );
      const found = await entity<{ runs: { info: { run_id: string } }[] }>(
        await request(harness.app, `${base}/runs/search`, {
          method: 'POST',
          cookie: project.viewer.cookie,
          body: { experiment_ids: ['0'] },
        }),
        200,
      );
      expect(found.runs.map((run) => run.info.run_id)).toEqual([created.run.info.run_id]);
      const recorded = await entity<ExperimentResponse>(
        await request(harness.app, `${base}/experiments/get?experiment_id=0`, {
          cookie: project.viewer.cookie,
        }),
        200,
      );
      expect(recorded.experiment.experiment_id).toBe(created.run.info.experiment_id);
    });

    it('メンバーでない人は "0" を読めない', async () => {
      const refused = await request(harness.app, `${base}/experiments/get?experiment_id=0`, {
        cookie: project.outsider.cookie,
      });
      expect(refused.status).toBe(403);
      const search = await request(harness.app, `${base}/runs/search`, {
        method: 'POST',
        cookie: project.outsider.cookie,
        body: { experiment_ids: ['0'] },
      });
      expect(search.status).toBe(403);
    });
  },
);
