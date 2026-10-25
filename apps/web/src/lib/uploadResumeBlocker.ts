// 途中のアップロードを続けられない理由。セッションの状態かAPIの拒否から読み取り、画面が生の
// エラーではなく、何が起きて次に何をすればよいかを言えるようにする。
import type { ArtifactUpload } from '@mmt/contracts';
import { RequestError } from '../api/http';

export type ResumeBlocker =
  /** 7日の期限を過ぎた。受け取ったpartは捨てられる。 */
  | 'expired'
  /** 破棄された、検証に失敗した、またはもうサーバーに無い。 */
  | 'gone'
  /** 利用者がProjectのEditorの権限をもう持っていないか、tokenにそのscopeが無い。 */
  | 'permissionLost'
  /** ほかの利用者か、ほかの認証情報（token、Job）が始めたもの。続けられるのはそれだけ。 */
  | 'otherCredential'
  | 'runDeleted'
  | 'sizeDiffers'
  | 'contentDiffers';

// アップロードセッションはここからは続けられないが、ファイルは最初のバイトから送り直せる。
const UNUSABLE_SESSION_BLOCKERS: ReadonlySet<ResumeBlocker> = new Set(['expired', 'gone', 'otherCredential']);
// これらは選んだファイルに属するので、別のファイルを選べば解消しうる。
const FILE_BLOCKERS: ReadonlySet<ResumeBlocker> = new Set(['sizeDiffers', 'contentDiffers']);

const BLOCKER_BY_CODE: Readonly<Record<string, ResumeBlocker>> = {
  upload_expired: 'expired',
  upload_not_open: 'gone',
  not_found: 'gone',
  project_forbidden: 'permissionLost',
  scope_required: 'permissionLost',
  upload_forbidden: 'otherCredential',
  run_deleted: 'runDeleted',
};

/** `now`はエポックからのミリ秒。期限を過ぎた開いたセッションは、掃除の処理が印を付ける前から期限切れとする。 */
export function blockerFromSession(
  session: Pick<ArtifactUpload, 'status' | 'expiresAt'>,
  now: number,
): ResumeBlocker | null {
  if (session.status === 'expired') return 'expired';
  if (session.status === 'aborted' || session.status === 'failed') return 'gone';
  if (session.status === 'open' && Date.parse(session.expiresAt) <= now) return 'expired';
  return null;
}

/** ネットワークの切断のように、セッションについて何も表さない失敗にはnull。 */
export function blockerFromFailure(failure: unknown): ResumeBlocker | null {
  if (!(failure instanceof RequestError) || !failure.code) return null;
  return BLOCKER_BY_CODE[failure.code] ?? null;
}

/** セッション自体がもう使えないときにtrue。ファイルは最初のバイトから送り直せる。 */
export const isSessionUnusable = (blocker: ResumeBlocker) => UNUSABLE_SESSION_BLOCKERS.has(blocker);
export const canChooseAnotherFileAfter = (blocker: ResumeBlocker) => FILE_BLOCKERS.has(blocker);
