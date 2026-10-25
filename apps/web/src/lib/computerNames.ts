import type { ComputeTargetOverview } from '@mmt/contracts';

type NamedComputer = Pick<ComputeTargetOverview, 'id' | 'name'>;

/**
 * コンピュータ`targetId`の名前。まず`known`（画面が既に持っているコンピュータ。たとえばProjectで
 * 使えるもの）から探し、次に全コンピュータの一覧（GET /targets/overview）から探す。その一覧が
 * 届くまでは''を返し、表に生のidが一瞬出ないようにする。どちらにも無ければ削除されたものとして
 * `deletedLabel`を返す。
 */
export function computerNameOf({ known, computers, targetId, deletedLabel }: {
  known: readonly NamedComputer[];
  computers: readonly NamedComputer[] | undefined;
  targetId: string;
  deletedLabel: string;
}): string {
  const knownName = known.find((computer) => computer.id === targetId)?.name;
  if (knownName) return knownName;
  if (!computers) return '';
  return computers.find((computer) => computer.id === targetId)?.name ?? deletedLabel;
}
