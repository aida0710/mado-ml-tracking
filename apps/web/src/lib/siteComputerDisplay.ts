import type { ComputeTarget, Launcher, SiteConnectionCheck, SiteKey } from '@mmt/contracts';
import type { SelectOption } from '../types/form';
import { text } from '../i18n/catalog';
import { formatNote } from '../i18n/textJoining';

// 表でバージョンを見分けるのに足りるSHA-256の長さ。完全な値はtitleにある。
const SHORT_SHA256_LENGTH = 12;

/**
 * 一覧に出す、コンピュータの持ち主。自分のものか、
 * 所有者の名前（名前が分からなければそのID）。
 */
export function targetOwnerLabel(
  target: Pick<ComputeTarget, 'ownerUserId'> & { ownerName: string | null },
  userId: string,
): string {
  if (target.ownerUserId === userId) return text.targetOwnerSelf;
  return target.ownerName ?? target.ownerUserId;
}

/**
 * siteに割り当てられるランチャー。有効なものと、取り消されていても今割り当てているもの
 * （全体管理者には名前で、ほかの人にはidで見える）。変えるまでフォームに出し続けるため。
 */
export function launcherOptions(
  launchers: readonly Launcher[],
  selectedId: string,
): SelectOption[] {
  const revoked = (name: string) => `${name}${formatNote(text.launcherRevoked)}`;
  const options = launchers
    .filter((launcher) => launcher.revokedAt === null || launcher.id === selectedId)
    .map((launcher) => ({
      value: launcher.id,
      label: launcher.revokedAt === null ? launcher.name : revoked(launcher.name),
    }));
  const isListed = options.some((option) => option.value === selectedId);
  if (!selectedId || isListed) return options;
  return [...options, { value: selectedId, label: revoked(selectedId) }];
}

/** siteの有効な鍵のうち、共有アカウントの鍵。個人の鍵はそれぞれ1人のもの。 */
export function sharedAccountKey(keys: readonly SiteKey[]): SiteKey | null {
  return keys.find((key) => key.userId === null) ?? null;
}

/** ランチャーが、その鍵の公開鍵をまだ公開していない。 */
export const isKeyRequested = (key: SiteKey | null | undefined): boolean =>
  key?.status === 'requested';

/**
 * ランチャーが鍵を作り終えたので、その鍵でログインできる。それより前のログインの確認はAPIが
 * 拒む（site_check_unavailable）。
 */
export const isKeyReady = (key: SiteKey | null | undefined): boolean => key?.status === 'ready';

/** 最新の確認（APIは新しい順に返す）が、まだランチャーを待っている。 */
export const isConnectionCheckInProgress = (checks: readonly SiteConnectionCheck[]): boolean =>
  checks[0]?.status === 'queued';

export const shortSha256 = (sha256: string): string => sha256.slice(0, SHORT_SHA256_LENGTH);
