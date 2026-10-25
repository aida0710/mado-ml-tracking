import { DomainError } from './errors.js';

// 自動実行とサーバーは、これらの前置きの下に来歴を記録する。自動実行と評価はこれを信用するので、
// どの経路でも利用者の入力で付けたり外したりさせない。mlflow.*は書き込めるままにする。MLflowの
// クライアントはmlflow.runNameのようなシステムのtagを自分で付けるため。
export const RESERVED_RUN_TAG_PREFIXES = ['automation.', 'mmt.'] as const;

export function findReservedRunTag(keys: Iterable<string>): string | undefined {
  for (const key of keys)
    if (RESERVED_RUN_TAG_PREFIXES.some((prefix) => key.startsWith(prefix))) return key;
  return undefined;
}

export function reservedRunTagMessage(key: string): string {
  return `${key} is a reserved tag managed by the server and cannot be changed`;
}

export function assertNoReservedRunTags(tags: Record<string, string>): void {
  const reserved = findReservedRunTag(Object.keys(tags));
  if (reserved !== undefined)
    throw new DomainError({
      status: 422,
      code: 'reserved_tag',
      message: reservedRunTagMessage(reserved),
      details: { tag: reserved },
    });
}
