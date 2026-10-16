import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComputeTargetDetails } from '@mmt/contracts';
import { ComputerDetails } from './ComputerDetails';
import { computeTargetDetails } from '../../tests/fixtures/execution';

// The worker setup fills in the address the page was opened with.
const PAGE_ORIGIN = 'https://mmt.example.test';
const WORKER_SETUP_TITLE = 'workerの設定</h2>';
const aliceComputer: ComputeTargetDetails = {
  ...computeTargetDetails,
  ownerUserId: 'alice',
  ownerName: 'Alice',
};
const render = (target: ComputeTargetDetails, user: { id: string; isAdmin: boolean }) =>
  renderToStaticMarkup(<ComputerDetails target={target} user={user} onTargetChanged={() => {}} />);

describe('コンピュータの詳細（ssh・local）', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN } }));
  afterEach(() => vi.unstubAllGlobals());

  it('所有者と全体管理者には、IDを入れたworkerの設定を出す', () => {
    for (const user of [{ id: 'alice', isAdmin: false }, { id: 'admin', isAdmin: true }]) {
      const html = render(aliceComputer, user);
      expect(html, user.id).toContain(WORKER_SETUP_TITLE);
      expect(html, user.id).toContain(`--target-ids ${aliceComputer.id}`);
      expect(html, user.id).not.toContain('data-testid="worker-set-up-by"');
    }
  });

  it('使えるだけの人には、workerの設定を出さず、誰が設定するかとコピーできるIDを出す', () => {
    const html = render(aliceComputer, { id: 'bob', isAdmin: false });
    expect(html).not.toContain(WORKER_SETUP_TITLE);
    expect(html).not.toContain('--target-ids');
    expect(html).toContain(
      '<dt>workerの設定</dt><dd><span data-testid="worker-set-up-by">所有者（Aliceさん）か全体管理者が設定します。</span></dd>',
    );
    expect(html).toContain(`>${aliceComputer.id}</code>`);
  });

  it('管理者所有のコンピュータでは所有者名を表示する', () => {
    const html = render(computeTargetDetails, { id: 'bob', isAdmin: false });
    expect(html).not.toContain(WORKER_SETUP_TITLE);
    expect(html).toContain('>所有者（Adminさん）か全体管理者が設定します。</span>');
  });
});
