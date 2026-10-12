import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComputeTargetDetails, WorkerPresence } from '@mmt/contracts';
import { ComputeTargetsTable } from './ComputeTargetsTable';
import { computeTargetDetails } from '../../tests/fixtures/execution';
import {
  globalSiteDetails,
  ownedSiteDetails,
  publicSiteForUser,
} from '../../tests/fixtures/siteComputers';

const renderTable = (
  targets: ComputeTargetDetails[],
  userId: string,
  workers: WorkerPresence[] = [],
) =>
  renderToStaticMarkup(
    <ComputeTargetsTable targets={targets} workers={workers} user={{ id: userId }} />,
  );

const offlineWorker: WorkerPresence = {
  projectId: 'project',
  tokenId: 'token',
  tokenName: 'worker token',
  workerId: 'gpu-host',
  version: null,
  hostname: null,
  targetIds: [computeTargetDetails.id],
  parallelJobs: null,
  startedAt: '2026-10-10T00:00:00Z',
  lastSeenAt: '2026-10-11T04:19:30Z',
  status: 'offline',
  activeJobCount: 0,
  capabilities: [],
};

describe('プロジェクトのComputeのコンピュータ一覧', () => {
  it('siteには投入方式・CPU・arrayの印を付け、設定の見える人には接続先を出す', () => {
    const html = renderTable([computeTargetDetails, globalSiteDetails], 'admin');
    expect(html).toContain('自動投入');
    expect(html).toContain('arm64');
    expect(html).toContain('array対応');
    expect(html).toContain('login.example.invalid:2222');
    expect(html).toContain('Jobごとに数を指定');
    expect(html).toContain('worker@worker.invalid:22');
  });

  it('所有者と公開範囲を出し、Privateには鍵の印を付ける', () => {
    const html = renderTable([{ ...ownedSiteDetails, visibility: 'private' }], 'alice');
    expect(html).toContain('自分');
    expect(html).toContain('Private');
    expect(html).toContain('lucide-lock');
    expect(renderTable([publicSiteForUser], 'bob')).toContain('Alice');
  });

  it('読み取りだけで、編集・有効の切り替え・詳細を開くボタンを出さない', () => {
    const html = renderTable([computeTargetDetails, ownedSiteDetails], 'alice');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).toContain('有効');
  });

  it('有効でもworkerがいない・オフラインなら、そう出す。siteにはworkerが要らない', () => {
    expect(renderTable([computeTargetDetails], 'admin')).toContain('workerなし');
    const offline = renderTable([computeTargetDetails], 'admin', [offlineWorker]);
    expect(offline).toContain('workerオフライン');
    expect(offline).toContain('最終応答');
    const online = renderTable([computeTargetDetails], 'admin', [
      { ...offlineWorker, status: 'online' },
    ]);
    expect(online).toContain('workerオンライン 1');
    expect(renderTable([globalSiteDetails], 'admin')).toContain('不要（site）');
  });
});
