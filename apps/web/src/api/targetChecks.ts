import type {
  TargetCheck,
  TargetCheckWorker,
  TargetCheckWorkerPresence,
  TargetDirectoryListing,
} from '@mmt/contracts';
import { encodeId, jsonRequest, request, requestItems } from './http';

const targetPath = (targetId: string) => `/targets/${encodeId(targetId)}`;

// 接続確認とディレクトリの読み取りは全体管理者の操作。ほかの人にはAPIが403を返す。
export const targetChecksApi = {
  list: (targetId: string, signal?: AbortSignal) =>
    requestItems<TargetCheck>(`${targetPath(targetId)}/checks`, signal),
  /** `worker`を省くと、MMT_WORKER_TARGET_IDSにそのコンピュータがあるworkerが確認する。 */
  request: (targetId: string, worker?: TargetCheckWorker) =>
    request<TargetCheck>(
      `${targetPath(targetId)}/checks`,
      worker ? jsonRequest('POST', { worker }) : { method: 'POST' },
    ),
  /** 依頼できるオンラインのworkerと、それぞれがホストで見つけたSSHのファイル。 */
  workers: (signal?: AbortSignal) =>
    requestItems<TargetCheckWorkerPresence>('/targets/check-workers', signal),
  requestDirectoryListing: (
    targetId: string,
    listing: { path: string; worker: TargetCheckWorker },
  ) =>
    request<TargetDirectoryListing>(
      `${targetPath(targetId)}/directory-listings`,
      jsonRequest('POST', listing),
    ),
  directoryListing: (targetId: string, listingId: string, signal?: AbortSignal) =>
    request<TargetDirectoryListing>(
      `${targetPath(targetId)}/directory-listings/${encodeId(listingId)}`,
      { signal },
    ),
};
