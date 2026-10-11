import { describe, expect, it } from 'vitest';
import type { Job, RunStatus } from '@mmt/contracts';
import {
  collectResumedRunIds,
  findRunJob,
  getCheckpointArtifactFileName,
  getCheckpointResumeOffer,
  getResumeCheckpointRecord,
} from './checkpointResume';
import { canControlJob } from './permissions';
import { queuedJob } from '../../tests/fixtures/execution';

function job(id: string, runId: string): Job {
  return { ...queuedJob, id, runId, status: 'failed', exitCode: 1 };
}

describe('checkpointからの再開の出し方', () => {
  const stopped = { status: 'failed' } as const;

  it('失敗・停止したRunに止まったJobがあり、Jobを再実行できる人には再開を出す', () => {
    for (const status of ['failed', 'canceled'] as const)
      expect(
        getCheckpointResumeOffer({ run: { status }, job: { status }, canRetryJob: true }),
      ).toBe('resume');
  });

  it('完了・実行中のRunには再開も理由も出さない', () => {
    const notResumable: RunStatus[] = ['queued', 'running', 'finished'];
    for (const status of notResumable)
      for (const canRetryJob of [true, false])
        expect(
          getCheckpointResumeOffer({ run: { status }, job: { status: 'failed' }, canRetryJob }),
        ).toBe('none');
  });

  it('作成者でないeditorには、再開の代わりに作成者とProject adminだけができると示す', () => {
    // The API answers 403 job_owner_required to a retry from anyone else.
    const editor = { role: 'editor', userId: 'editor-b' } as const;
    const run = { ...stopped, createdBy: 'editor-a' };
    const canRetryJob = canControlJob(editor.role, editor.userId, run);
    expect(getCheckpointResumeOffer({ run, job: stopped, canRetryJob })).toBe('creatorOnly');
    expect(
      getCheckpointResumeOffer({
        run,
        job: stopped,
        canRetryJob: canControlJob('editor', 'editor-a', run),
      }),
    ).toBe('resume');
    expect(
      getCheckpointResumeOffer({
        run,
        job: stopped,
        canRetryJob: canControlJob('admin', 'admin-c', run),
      }),
    ).toBe('resume');
  });

  it('Jobの無いRunと、Jobがまだ終端でないRunには再開を出さない', () => {
    expect(getCheckpointResumeOffer({ run: stopped, job: undefined, canRetryJob: true })).toBe(
      'none',
    );
    expect(
      getCheckpointResumeOffer({ run: stopped, job: { status: 'running' }, canRetryJob: true }),
    ).toBe('none');
  });
});

describe('RunのJobの特定', () => {
  it('新しい順の一覧から同じRunの最初のJobを返す', () => {
    const jobs = [job('newer', 'run-a'), job('other', 'run-b'), job('older', 'run-a')];
    expect(findRunJob(jobs, 'run-a')?.id).toBe('newer');
    expect(findRunJob(jobs, 'run-c')).toBeUndefined();
  });
});

describe('再開Runの記録の読み取り', () => {
  it('environment.resumeから再開元のcheckpointとstepを読む', () => {
    const resume = { checkpointId: 'checkpoint', sourceRunId: 'source', step: 1200 };
    expect(getResumeCheckpointRecord({ environment: { resume, python: '3.12' } })).toEqual(resume);
  });

  it('記録が無い・形が契約と違うときは再開Runとして扱わない', () => {
    expect(getResumeCheckpointRecord({ environment: {} })).toBeNull();
    expect(getResumeCheckpointRecord({ environment: { resume: 'checkpoint' } })).toBeNull();
    expect(
      getResumeCheckpointRecord({
        environment: { resume: { checkpointId: 'checkpoint', sourceRunId: 'source', step: '12' } },
      }),
    ).toBeNull();
    expect(
      getResumeCheckpointRecord({
        environment: { resume: { checkpointId: 'checkpoint', step: 12 } },
      }),
    ).toBeNull();
  });

  it('Run一覧のsummaryからcheckpointを指定したRunだけを集める', () => {
    const runs = [
      { id: 'resumed', resumeCheckpointId: 'checkpoint' },
      { id: 'scratch', resumeCheckpointId: null },
      { id: 'older-api' },
    ];
    expect([...collectResumedRunIds(runs)]).toEqual(['resumed']);
  });
});

describe('checkpointのArtifactのダウンロード名', () => {
  it('フォルダを除いたファイル名にする', () => {
    expect(getCheckpointArtifactFileName({ path: 'checkpoints/step-100.tar' })).toBe('step-100.tar');
    expect(getCheckpointArtifactFileName({ path: 'model.safetensors' })).toBe('model.safetensors');
  });
});
