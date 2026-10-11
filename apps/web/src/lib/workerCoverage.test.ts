import { describe, expect, it } from 'vitest';
import {
  checkWorkerCoverage,
  isWorkerMissing,
  jobWorkerCoverage,
  type WorkerCoverage,
} from './workerCoverage';

const target = { id: 'gpu-1', executor: 'ssh' as const };
const worker = (overrides: {
  targetIds?: string[] | null;
  status?: 'online' | 'offline';
  lastSeenAt?: string;
}) => ({
  targetIds: overrides.targetIds === undefined ? ['gpu-1'] : overrides.targetIds,
  status: overrides.status ?? 'online',
  lastSeenAt: overrides.lastSeenAt ?? '2026-10-11T04:19:00Z',
});

describe('jobWorkerCoverage', () => {
  it('担当するworkerがいなければnoneになり、Jobは始まらない', () => {
    const coverage = jobWorkerCoverage(target, [worker({ targetIds: ['other'] })]);
    expect(coverage).toEqual({ state: 'none' });
    expect(isWorkerMissing(coverage)).toBe(true);
  });

  it('担当するworkerが全部オフラインなら、最後に応答した時刻を返す', () => {
    const coverage = jobWorkerCoverage(target, [
      worker({ status: 'offline', lastSeenAt: '2026-10-10T01:00:00Z' }),
      worker({ status: 'offline', lastSeenAt: '2026-10-11T04:19:00Z' }),
    ]);
    expect(coverage).toEqual({ state: 'offline', lastSeenAt: '2026-10-11T04:19:00Z' });
    expect(isWorkerMissing(coverage)).toBe(true);
  });

  it('コンピュータを指定しないworkerも、すべてのコンピュータのJobを受け取る', () => {
    const coverage = jobWorkerCoverage(target, [
      worker({ targetIds: null }),
      worker({ status: 'offline' }),
    ]);
    expect(coverage).toEqual({ state: 'online', onlineCount: 1 });
    expect(isWorkerMissing(coverage)).toBe(false);
  });

  it('siteはworkerを使わない', () => {
    const coverage: WorkerCoverage = jobWorkerCoverage({ id: 'site', executor: 'site' }, []);
    expect(coverage).toEqual({ state: 'notNeeded' });
    expect(isWorkerMissing(coverage)).toBe(false);
  });
});

describe('checkWorkerCoverage', () => {
  it('接続確認は、コンピュータを名指ししたworkerだけが受け取る', () => {
    expect(checkWorkerCoverage(target, [worker({ targetIds: null })])).toEqual({ state: 'none' });
    expect(checkWorkerCoverage(target, [worker({})])).toEqual({ state: 'online', onlineCount: 1 });
  });
});
