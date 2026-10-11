// Why an unfinished upload cannot continue, read from the session's state or from the API's
// refusal, so the screen can say what happened and what to do next instead of a raw error.
import type { ArtifactUpload } from '@mmt/contracts';
import { RequestError } from '../api/http';

export type ResumeBlocker =
  /** Past the 7-day deadline; the received parts are discarded. */
  | 'expired'
  /** Discarded, failed verification, or no longer on the server. */
  | 'gone'
  /** The user no longer has editor access to the Project, or the token lacks the scope. */
  | 'permissionLost'
  /** Started by another user or another credential (a token, a Job); only that one may continue. */
  | 'otherCredential'
  | 'runDeleted'
  | 'sizeDiffers'
  | 'contentDiffers';

// The session can never continue from here, while the file can still go up from the first byte.
const UNUSABLE_SESSION_BLOCKERS: ReadonlySet<ResumeBlocker> = new Set(['expired', 'gone', 'otherCredential']);
// These belong to the chosen file, so choosing another file can clear them.
const FILE_BLOCKERS: ReadonlySet<ResumeBlocker> = new Set(['sizeDiffers', 'contentDiffers']);

const BLOCKER_BY_CODE: Readonly<Record<string, ResumeBlocker>> = {
  upload_expired: 'expired',
  upload_not_open: 'gone',
  not_found: 'gone',
  project_forbidden: 'permissionLost',
  insufficient_scope: 'permissionLost',
  upload_forbidden: 'otherCredential',
  run_deleted: 'runDeleted',
};

/** `now` is epoch milliseconds; an open session past its deadline is expired before the sweeper marks it. */
export function blockerFromSession(
  session: Pick<ArtifactUpload, 'status' | 'expiresAt'>,
  now: number,
): ResumeBlocker | null {
  if (session.status === 'expired') return 'expired';
  if (session.status === 'aborted' || session.status === 'failed') return 'gone';
  if (session.status === 'open' && Date.parse(session.expiresAt) <= now) return 'expired';
  return null;
}

/** Null for failures that say nothing about the session, such as a lost network. */
export function blockerFromFailure(failure: unknown): ResumeBlocker | null {
  if (!(failure instanceof RequestError) || !failure.code) return null;
  return BLOCKER_BY_CODE[failure.code] ?? null;
}

/** True when the session itself is done for; the file can be sent again from the first byte. */
export const isSessionUnusable = (blocker: ResumeBlocker) => UNUSABLE_SESSION_BLOCKERS.has(blocker);
export const canChooseAnotherFileAfter = (blocker: ResumeBlocker) => FILE_BLOCKERS.has(blocker);
