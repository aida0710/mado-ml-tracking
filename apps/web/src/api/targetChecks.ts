import type {
  TargetCheck,
  TargetCheckWorker,
  TargetCheckWorkerPresence,
  TargetDirectoryListing,
} from '@mmt/contracts';
import { encodeId, jsonRequest, request, requestItems } from './http';

const targetPath = (targetId: string) => `/targets/${encodeId(targetId)}`;

// Checks and directory listings are global-administrator operations; the API answers 403 to others.
export const targetChecksApi = {
  list: (targetId: string, signal?: AbortSignal) =>
    requestItems<TargetCheck>(`${targetPath(targetId)}/checks`, signal),
  /** Without `worker`, a worker whose MMT_WORKER_TARGET_IDS names the computer checks it. */
  request: (targetId: string, worker?: TargetCheckWorker) =>
    request<TargetCheck>(
      `${targetPath(targetId)}/checks`,
      worker ? jsonRequest('POST', { worker }) : { method: 'POST' },
    ),
  /** Online workers one may ask, with the SSH files they found on their hosts. */
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
