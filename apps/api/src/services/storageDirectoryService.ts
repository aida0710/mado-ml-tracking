import type { Dirent } from 'node:fs';
import { opendir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DirectorySuggestions } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import {
  compareDirectoryNames,
  isSuggestedName,
  planDirectorySuggestions,
  type DirectorySuggestionPlan,
} from '../domain/directorySuggestionRules.js';
import { requireGlobalAdmin } from './accessService.js';

// 入力しながら目で追える数。これより長い一覧になるなら、管理者が名前をもっと入力すべき。
export const DIRECTORY_SUGGESTION_LIMIT = 50;
// 1回のリクエストで一覧のディレクトリから読む項目の数。巨大なディレクトリでも、キー入力の
// たびの負荷を小さく保つ。これより先の一致は見えず、応答には切り詰めた印を付ける。
export const DIRECTORY_SCAN_LIMIT = 5000;
// 応答しなくなったマウント（NFS）でリクエストを止めてはならない。この時間を過ぎたら
// 何も候補に出さない。
export const DIRECTORY_SUGGESTION_TIMEOUT_MS = 2000;

interface DirectoryScan {
  names: string[];
  isCut: boolean;
}

async function pathStatus(resolvedPath: string): Promise<DirectorySuggestions['status']> {
  try {
    return (await stat(resolvedPath)).isDirectory() ? 'directory' : 'not_directory';
  } catch {
    // 無いか、APIのプロセスから見えないか。どちらにしても、まだ使えるものは無い。
    return 'missing';
  }
}

async function isDirectoryEntry(entry: Dirent, plan: DirectorySuggestionPlan): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  // シンボリックリンクはディレクトリを指していれば数える。リンク先が無いものは飛ばす。
  const target = await stat(path.join(plan.listedDirectory, entry.name)).catch(() => undefined);
  return target?.isDirectory() ?? false;
}

/** 一覧のディレクトリの項目のうち、名前が入力の前方部分に合うもの。読むのは最大scanLimit件。 */
async function readMatchingEntries(
  plan: DirectorySuggestionPlan,
  scanLimit: number,
): Promise<{ entries: Dirent[]; isCut: boolean }> {
  const entries: Dirent[] = [];
  let scanned = 0;
  try {
    // ループを途中で抜けると、ディレクトリのハンドルは閉じられる。
    for await (const entry of await opendir(plan.listedDirectory)) {
      if (scanned === scanLimit) return { entries, isCut: true };
      scanned += 1;
      if (isSuggestedName(entry.name, plan)) entries.push(entry);
    }
  } catch {
    // 読めないディレクトリや無いディレクトリには出す候補が無い。呼び出し元には空の一覧が返る。
    return { entries: [], isCut: false };
  }
  return { entries, isCut: false };
}

/** 一致したディレクトリの名前。名前の順で、最大`limit`件。 */
async function matchingDirectoryNames(
  plan: DirectorySuggestionPlan,
  limits: { names: number; scan: number },
): Promise<DirectoryScan> {
  const { entries, isCut } = await readMatchingEntries(plan, limits.scan);
  entries.sort((left, right) => compareDirectoryNames(left.name, right.name));
  const names: string[] = [];
  for (const entry of entries) {
    if (names.length >= limits.names) break;
    if (await isDirectoryEntry(entry, plan)) names.push(entry.name);
  }
  return { names, isCut };
}

/** `milliseconds`のあとでundefinedに解決する。処理が先に終わったら`cancel`でタイマーを止める。 */
function deadline(milliseconds: number): { expired: Promise<undefined>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), milliseconds);
  });
  return { expired, cancel: () => clearTimeout(timer) };
}

/**
 * 管理者がfilesystemの保存先のrootPathを入力するときに、補完の候補にするAPIサーバー上の
 * ディレクトリ（GET /admin/storage-directories）。ファイルシステムの失敗には、候補なしで答える。
 */
export class StorageDirectoryService {
  constructor(
    private readonly limits: { scan: number; timeoutMs: number } = {
      scan: DIRECTORY_SCAN_LIMIT,
      timeoutMs: DIRECTORY_SUGGESTION_TIMEOUT_MS,
    },
    // テストで差し替え、いつまでも応答しないディレクトリの読み取りを再現する。
    private readonly scanDirectory: typeof matchingDirectoryNames = matchingDirectoryNames,
  ) {}

  async suggest(principal: Principal, typedPath: string): Promise<DirectorySuggestions> {
    requireGlobalAdmin(principal);
    // filesystemの保存先は、呼び出したときの作業ディレクトリを基準にrootPathを解決する。
    const plan = planDirectorySuggestions(typedPath, process.cwd());
    const timer = deadline(this.limits.timeoutMs);
    // 上限より1つ多く名前を取り、一覧が切れたかどうかを知る。
    const found = await Promise.race([
      Promise.all([
        pathStatus(plan.resolvedPath),
        this.scanDirectory(plan, { names: DIRECTORY_SUGGESTION_LIMIT + 1, scan: this.limits.scan }),
      ]),
      timer.expired,
    ]).finally(timer.cancel);
    if (!found)
      return { resolvedPath: plan.resolvedPath, status: 'unavailable', items: [], truncated: true };
    const [status, scan] = found;
    return {
      resolvedPath: plan.resolvedPath,
      status,
      items: scan.names
        .slice(0, DIRECTORY_SUGGESTION_LIMIT)
        .map((name) => path.join(plan.listedDirectory, name)),
      truncated: scan.isCut || scan.names.length > DIRECTORY_SUGGESTION_LIMIT,
    };
  }
}
