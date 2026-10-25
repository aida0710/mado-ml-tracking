import { useEffect, useRef, useState } from 'react';
import type {
  TargetCheckWorker,
  TargetDirectoryListing,
  TargetDirectoryListingResult,
} from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import type { DirectoryListingState } from '../lib/targetPathSuggestions';

// The chosen worker polls every two seconds; reading the result about as often keeps the wait short.
const DIRECTORY_LISTING_POLL_MS = 1500;
// The API ends an unclaimed listing after a minute; the dialog stops waiting a little later.
const DIRECTORY_LISTING_WAIT_MS = 70_000;

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

const isWaiting = (listing: TargetDirectoryListing) =>
  listing.status === 'queued' || listing.status === 'claimed';

/** Asks the worker to read the directory and waits for what it read; null if it never answers. */
async function readDirectory(
  request: { targetId: string; worker: TargetCheckWorker; path: string },
  signal: AbortSignal,
): Promise<TargetDirectoryListingResult | null> {
  const deadline = Date.now() + DIRECTORY_LISTING_WAIT_MS;
  let listing = await targetChecksApi.requestDirectoryListing(request.targetId, {
    path: request.path,
    worker: request.worker,
  });
  while (isWaiting(listing) && Date.now() < deadline) {
    await pause(DIRECTORY_LISTING_POLL_MS, signal);
    listing = await targetChecksApi.directoryListing(request.targetId, listing.id, signal);
  }
  return listing.result;
}

/**
 * Directories of a computer read by the chosen worker, remembered by path while the dialog is
 * open. `version` changes whenever a reading ends or another computer or worker is chosen, so
 * path fields look their value up again. Another computer or worker starts from nothing.
 */
export function useTargetDirectoryListings({
  targetId,
  worker,
}: {
  targetId: string | null;
  worker: TargetCheckWorker | null;
}) {
  const scope = targetId && worker ? `${targetId}:${worker.tokenId}:${worker.workerId}` : null;
  const listings = useRef(new Map<string, DirectoryListingState>());
  const [readingCount, setReadingCount] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    listings.current = new Map();
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, [scope]);

  function remember(path: string, state: DirectoryListingState) {
    listings.current.set(path, state);
    setReadingCount((current) => current + 1);
  }

  function request(path: string): void {
    if (!targetId || !worker || listings.current.has(path) || !controller.current) return;
    const signal = controller.current.signal;
    const known = listings.current;
    known.set(path, { status: 'loading' });
    readDirectory({ targetId, worker, path }, signal).then(
      (result) => {
        // A reading of a former computer or worker is not remembered for the new one.
        if (signal.aborted || known !== listings.current) return;
        remember(path, result ? { status: 'read', result } : { status: 'failed' });
      },
      () => {
        if (!signal.aborted && known === listings.current) remember(path, { status: 'failed' });
      },
    );
  }

  return {
    /** Whether a worker can be asked (a saved computer and a chosen worker). */
    isAvailable: scope !== null,
    listingOf: (path: string) => listings.current.get(path),
    request,
    version: `${scope ?? ''}:${readingCount}`,
  };
}
