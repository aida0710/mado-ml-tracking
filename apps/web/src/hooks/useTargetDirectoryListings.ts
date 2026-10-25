import { useEffect, useRef, useState } from 'react';
import type {
  TargetCheckWorker,
  TargetDirectoryListing,
  TargetDirectoryListingResult,
} from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import type { DirectoryListingState } from '../lib/targetPathSuggestions';

// 選んだworkerは2秒ごとに取りに来る。結果もほぼ同じ間隔で読めば、待ち時間が短くなる。
const DIRECTORY_LISTING_POLL_MS = 1500;
// APIは誰も取らない一覧の依頼を1分で終わらせる。ダイアログはそれより少し後に待つのをやめる。
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

/** workerにディレクトリを読むよう頼み、読んだ結果を待つ。答えが来なければnull。 */
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
 * 選んだworkerが読んだコンピュータのディレクトリ。ダイアログが開いている間はパスごとに覚えておく。
 * 読み込みが終わるか、別のコンピュータやworkerを選ぶたびに`version`が変わり、パスの欄が値を
 * 問い合わせ直す。別のコンピュータやworkerでは何も無いところから始める。
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
        // 前のコンピュータやworkerで読んだ結果は、新しいものの分としては覚えない。
        if (signal.aborted || known !== listings.current) return;
        remember(path, result ? { status: 'read', result } : { status: 'failed' });
      },
      () => {
        if (!signal.aborted && known === listings.current) remember(path, { status: 'failed' });
      },
    );
  }

  return {
    /** workerに頼めるか（保存したコンピュータと、選んだworkerがある）。 */
    isAvailable: scope !== null,
    listingOf: (path: string) => listings.current.get(path),
    request,
    version: `${scope ?? ''}:${readingCount}`,
  };
}
