import { describe, expect, it } from 'vitest';
import { queuedJob, siteTarget } from '../../tests/fixtures/execution';
import {
  isWaitingManualSubmission,
  manualSiteOwnership,
  manualSubmissionGroups,
  manualSubmitCommand,
  OWNER_SUBMIT_OPTIONS,
} from './manualSubmission';

const waiting = { ...queuedJob, targetId: siteTarget.id, phase: 'waiting_manual' as const };
// どちらのコンピュータにも所有者がいる。見ている人は自分のJobを投入できる。
const sharedSite = { ...siteTarget, ownerName: 'Admin' };
const alicePc = { ...siteTarget, id: 'pc', name: 'Alice PC', ownerUserId: 'alice', ownerName: 'Alice' };

describe('手動投入を待つJob', () => {
  it('手動投入待ちのqueuedのJobだけをsiteごとに数える', () => {
    const jobs = [
      { ...waiting, id: 'a' },
      { ...waiting, id: 'b' },
      { ...waiting, id: 'c', status: 'claimed' as const, phase: 'submitting' as const },
      { ...queuedJob, id: 'd' },
      { ...waiting, id: 'e', targetId: 'removed-site' },
    ];
    expect(manualSubmissionGroups(jobs, [sharedSite], { id: 'alice' })).toEqual([
      { targetId: 'site', targetName: 'Supercomputer', waitingJobs: 2, ownership: { kind: 'someoneElse', ownerName: 'Admin' } },
      // 一覧に無くなったsiteもidを残し、コマンドを実行できるようにする。
      {
        targetId: 'removed-site',
        targetName: 'removed-site',
        waitingJobs: 1,
        ownership: { kind: 'global' },
      },
    ]);
  });

  it('PCのJobは、所有者には自分のコンピュータ、ほかのメンバーには所有者のコンピュータとして分ける', () => {
    const jobs = [
      { ...waiting, id: 'a', targetId: alicePc.id },
      { ...waiting, id: 'b' },
    ];
    const ownership = (viewerId: string) =>
      manualSubmissionGroups(jobs, [alicePc, sharedSite], { id: viewerId }).map((group) => [
        group.targetName,
        group.ownership,
      ]);
    expect(ownership('alice')).toEqual([
      ['Alice PC', { kind: 'own' }],
      ['Supercomputer', { kind: 'someoneElse', ownerName: 'Admin' }],
    ]);
    // ほかのメンバーには誰のコンピュータかが見える。それでも、そこで投入するのは自分のJob。
    expect(ownership('bob')).toEqual([
      ['Alice PC', { kind: 'someoneElse', ownerName: 'Alice' }],
      ['Supercomputer', { kind: 'someoneElse', ownerName: 'Admin' }],
    ]);
  });

  it('所有者の名前が無ければ、所有者のIDで出す', () => {
    expect(manualSiteOwnership({ ownerUserId: 'carol', ownerName: null }, { id: 'bob' })).toEqual({
      kind: 'someoneElse',
      ownerName: 'carol',
    });
    expect(manualSiteOwnership(undefined, { id: 'bob' })).toEqual({ kind: 'global' });
  });

  it('投入を受け取った後のJobは手動投入待ちにしない', () => {
    expect(isWaitingManualSubmission(waiting)).toBe(true);
    expect(isWaitingManualSubmission({ status: 'claimed', phase: 'submitted' })).toBe(false);
    expect(isWaitingManualSubmission({ status: 'canceled', phase: 'waiting_manual' })).toBe(false);
  });

  it('本人がsiteのログインノードで実行するコマンドはsiteのIDを指定する', () => {
    expect(manualSubmitCommand(siteTarget.id)).toBe('mado-tracking submit --site site');
  });

  it('PCで待ち受けるときは--watchを、所有者が全員のJobを投入するときは--allを付ける', () => {
    expect(manualSubmitCommand('pc', { watch: true })).toBe('mado-tracking submit --site pc --watch');
    expect(manualSubmitCommand('pc', { all: true, watch: true })).toBe(
      'mado-tracking submit --site pc --watch --all',
    );
    expect(manualSubmitCommand('pc', { all: false, watch: false })).toBe(
      'mado-tracking submit --site pc',
    );
    expect(manualSubmitCommand('pc', OWNER_SUBMIT_OPTIONS)).toBe(
      'mado-tracking submit --site pc --watch --all',
    );
  });
});
