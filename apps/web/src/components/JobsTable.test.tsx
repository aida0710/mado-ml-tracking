import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Hook, JobListItem } from '@mmt/contracts';
import { JobsTable } from './JobsTable';
import { ManualSubmissionNotice } from './ManualSubmissionNotice';
import { computeTarget, queuedJob, siteTarget } from '../../tests/fixtures/execution';

afterEach(() => vi.unstubAllGlobals());

const listItem = (overrides: Partial<JobListItem>): JobListItem => ({
  ...queuedJob,
  runName: 'Generate speech',
  runKind: 'processing',
  taskId: null,
  taskName: null,
  sweepEarlyStopped: false,
  createdBy: 'user-researcher',
  createdByName: '研究者A',
  hasResumeCheckpoint: false,
  sweepTrial: null,
  automationRule: null,
  workflowExecution: null,
  requiredWorkerCapabilities: [],
  ...overrides,
});
const siteJob = listItem({
  id: 'site-job-0001',
  targetId: siteTarget.id,
  status: 'claimed',
  phase: 'submitted',
  gpuCount: 4,
  schedulerJobId: '12345.pbs',
  runnerHost: null,
  arrayGroupId: 'array-0001',
  arrayIndex: 3,
  arraySize: 64,
  parentJobId: 'driver-job-0001',
  hookId: 'hook-0001',
});
const hooks = [{ id: 'hook-0001', name: 'Shard generation' }] as Hook[];

function render(jobs: JobListItem[], canControl: (job: JobListItem) => boolean = () => true) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <JobsTable
        jobs={jobs}
        targets={[computeTarget, siteTarget]}
        hooks={hooks}
        projectId="project"
        selectedId=""
        canControl={canControl}
        resumedRunIds={undefined}
        onSelectJob={() => undefined}
        onSelectArray={() => undefined}
        onAction={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('Jobsの一覧', () => {
  it('siteのJobに段階、スケジューラのジョブID、GPU数、arrayの番号、親Jobとフックを表示する', () => {
    const html = render([siteJob]);
    expect(html).toContain('待ち行列');
    expect(html).toContain('12345.pbs');
    expect(html).toContain('GPU ×4');
    expect(html).toContain('3 / 64');
    expect(html).toContain('driver-j');
    expect(html).toContain('href="/projects/project/hooks?hook=hook-0001"');
    expect(html).toContain('Shard generation');
  });

  it('時間切れで終わったJobには終了の理由を、手動投入待ちのJobにはその段階を示す', () => {
    const html = render([
      listItem({ id: 'ended', status: 'failed', phase: 'running', endReason: 'timed_out' }),
      listItem({ id: 'manual', targetId: siteTarget.id, phase: 'waiting_manual' }),
    ]);
    expect(html).toContain('時間切れ');
    expect(html).toContain('手動投入待ち');
    expect(html).not.toContain('>実行中<');
  });

  it('sshのJobはGPU IDを表示し、siteの欄は空にする', () => {
    const html = render([listItem({ id: 'ssh', gpuIds: ['0', '1'], gpuCount: 2 })]);
    expect(html).toContain('0, 1');
    expect(html).not.toContain('GPU ×');
    expect(html).not.toContain('待ち行列');
  });

  it('作成者の列を出し、停止・再実行は操作できるJobの行にだけ出して、ほかの行には理由を文で示す', () => {
    const mine = listItem({ id: 'mine', status: 'running', createdBy: 'me', createdByName: '自分' });
    const others = listItem({ id: 'others', status: 'running', createdByName: '研究者B' });
    const html = render([mine, others], (job) => job.createdBy === 'me');
    expect(html).toContain('作成者');
    expect(html).toContain('研究者B');
    expect(html.match(/停止を要求/g)).toHaveLength(1);
    // A tooltip cannot be read by touch or keyboard, so the reason is the cell's own text.
    expect(html).toContain('>停止・再実行は作成者かProject adminだけができます<');
    expect(html).not.toContain('title="停止・再実行は');
  });

  it('起動元にSweepの試行と自動実行のルールを出し、Sweepへはリンクする', () => {
    const html = render([
      listItem({
        id: 'trial',
        sweepTrial: { sweepId: 'sweep-1', sweepName: 'lr探索', trialIndex: 3 },
      }),
      listItem({ id: 'rule', automationRule: { ruleId: 'rule-1', ruleName: '登録時に推論' } }),
    ]);
    expect(html).toContain('href="/projects/project/sweeps/sweep-1"');
    expect(html).toContain('Sweep: lr探索 #3');
    expect(html).toContain('自動実行: 登録時に推論');
  });

  it('最新checkpointからの再開は、再開できるcheckpointがあるJobにだけ出す', () => {
    const failed = { status: 'failed' as const };
    const withCheckpoint = render([listItem({ ...failed, id: 'a', hasResumeCheckpoint: true })]);
    expect(withCheckpoint).toContain('最新checkpointから再開');
    const without = render([listItem({ ...failed, id: 'b', hasResumeCheckpoint: false })]);
    expect(without).not.toContain('最新checkpointから再開');
    expect(without).toContain('新しいRunで再実行');
  });

  it('ワークフローのステップのJobには、APIが断る再実行ではなくワークフローの画面での再開を案内する', () => {
    const html = render([
      listItem({
        id: 'step',
        status: 'failed',
        hasResumeCheckpoint: true,
        workflowExecution: { workflowId: 'wf-1', executionId: 'ex-1' },
      }),
    ]);
    expect(html).not.toContain('新しいRunで再実行');
    expect(html).not.toContain('最新checkpointから再開');
    expect(html).toContain('href="/projects/project/workflows/wf-1?execution=ex-1"');
    expect(html).toContain('ワークフローの画面で再開');
  });

  it('完了したワークフローのステップのJobには、再開ではなくワークフローを開く案内を出す', () => {
    const html = render([
      listItem({
        id: 'step',
        status: 'finished',
        workflowExecution: { workflowId: 'wf-1', executionId: 'ex-1' },
      }),
    ]);
    expect(html).not.toContain('再開');
    expect(html).not.toContain('新しいRunで再実行');
    expect(html).toContain('href="/projects/project/workflows/wf-1?execution=ex-1"');
    expect(html).toContain('ワークフローを開く');
  });

  it('人が最大試行回数を超えて再実行したJobは、上限が自動の再実行のものだと示す', () => {
    expect(render([listItem({ attempt: 2, maxAttempts: 3 })])).toContain('2 / 3');
    expect(render([listItem({ attempt: 2, maxAttempts: 1 })])).toContain(
      '2（自動の再実行は1回目まで）',
    );
  });

  it('手動投入を待つsiteごとに、本人が実行するコマンドを表示する', () => {
    // The setup below the commands points `mado-tracking submit` at this page's address.
    vi.stubGlobal('window', { location: { origin: 'https://mmt.example.test' } });
    const html = renderToStaticMarkup(
      <ManualSubmissionNotice
        groups={[
          { targetId: 'site', targetName: 'Miyabi', waitingJobs: 2, ownership: { kind: 'global' } },
        ]}
      />,
    );
    expect(html).toContain('Miyabi: 2件');
    expect(html).toContain('mado-tracking submit --site site');
    // The hint mentions an owner's --all; a site one does not own gets no such command.
    expect(html).not.toContain('--all</code>');
    expect(renderToStaticMarkup(<ManualSubmissionNotice groups={[]} />)).toBe('');
  });
});
