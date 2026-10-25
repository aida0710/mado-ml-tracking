import type { ComputeTargetOverview } from '@mmt/contracts';

// 全体設定 → コンピュータの行。Bob（研究者）から見たもの。
const row: ComputeTargetOverview = {
  id: 'target',
  name: 'Container worker',
  executor: 'ssh',
  submissionMode: 'automatic',
  cpuArch: 'amd64',
  supportsArray: false,
  enabled: true,
  visibility: 'public',
  ownerUserId: 'admin',
  ownerName: '管理者',
  usable: true,
  canManage: false,
  launcher: null,
};

/** 全体管理者のpublicなssh target。全員が使える。 */
export const publicSshOverview: ComputeTargetOverview = row;

/** AliceのprivateなPC: Bobにはあることは見えるが、接続のしかたは見えず、使えない。 */
export const privatePcOverview: ComputeTargetOverview = {
  ...row,
  id: 'pc',
  name: 'Alice PC',
  executor: 'site',
  submissionMode: 'manual',
  visibility: 'private',
  ownerUserId: 'alice',
  ownerName: 'Alice',
  usable: false,
};

/** ランチャーが最後に問い合わせた時刻が分かっている、publicで自動投入のsite。 */
export const automaticSiteOverview: ComputeTargetOverview = {
  ...row,
  id: 'site',
  name: 'Supercomputer',
  executor: 'site',
  cpuArch: 'arm64',
  supportsArray: true,
  launcher: { name: 'main', lastSeenAt: '2026-10-10T00:00:00Z', revoked: false },
};

/** Bob自身のprivateなsite: 自分で使い、管理する。 */
export const ownSiteOverview: ComputeTargetOverview = {
  ...row,
  id: 'bob-site',
  name: 'Bob GPU',
  executor: 'site',
  visibility: 'private',
  ownerUserId: 'bob',
  ownerName: 'Bob',
  canManage: true,
  launcher: null,
};
