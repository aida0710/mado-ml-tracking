import type { ComputeTargetOverview } from '@mmt/contracts';

type NamedComputer = Pick<ComputeTargetOverview, 'id' | 'name'>;

/**
 * The name of the computer `targetId`: from `known` (the computers a screen already has, such as
 * the ones usable in the Project) first, then from the list of every computer (GET
 * /targets/overview). '' while that list has not arrived, so a table does not flash the raw id,
 * and `deletedLabel` when the computer is in neither, as it was deleted.
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
