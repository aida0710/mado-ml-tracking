import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { TargetCheckWorker } from '@mmt/contracts';
import {
  itemsOf,
  targetCheckSchema,
  targetCheckWorkerPresenceSchema,
  targetDirectoryListingSchema,
} from '@mmt/contracts/schemas';
import { encodeId } from './http';

const targetPath = (targetId: string) => `/api/targets/${encodeId(targetId)}`;

// 接続確認とディレクトリの読み取りは全体管理者の操作。ほかの人にはAPIが403を返す。
export const targetChecksApi = {
  list: async (targetId: string, signal?: AbortSignal) =>
    (await requestJson(`${targetPath(targetId)}/checks`, { schema: itemsOf(targetCheckSchema), init: { signal } }))
      .items,
  /** `worker`を省くと、MMT_WORKER_TARGET_IDSにそのコンピュータがあるworkerが確認する。 */
  request: (targetId: string, worker?: TargetCheckWorker) =>
    requestJson(`${targetPath(targetId)}/checks`, {
      schema: targetCheckSchema,
      init: worker ? jsonRequestInit('POST', { worker }) : { method: 'POST' },
    }),
  /** 依頼できるオンラインのworkerと、それぞれがホストで見つけたSSHのファイル。 */
  workers: async (signal?: AbortSignal) =>
    (
      await requestJson('/api/targets/check-workers', {
        schema: itemsOf(targetCheckWorkerPresenceSchema),
        init: { signal },
      })
    ).items,
  requestDirectoryListing: (targetId: string, listing: { path: string; worker: TargetCheckWorker }) =>
    requestJson(`${targetPath(targetId)}/directory-listings`, {
      schema: targetDirectoryListingSchema,
      init: jsonRequestInit('POST', listing),
    }),
  directoryListing: (targetId: string, listingId: string, signal?: AbortSignal) =>
    requestJson(`${targetPath(targetId)}/directory-listings/${encodeId(listingId)}`, {
      schema: targetDirectoryListingSchema,
      init: { signal },
    }),
};
