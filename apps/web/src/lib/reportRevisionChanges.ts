// レポートのバージョンが、1つ前のバージョンから何を変えたかをブロックごとに表す。ブロックは
// バージョンをまたいでidを保つので、idで編集したブロックと、消したブロック・新しいブロックを
// 見分けられる。
import type { ReportBlock, ReportBlockType } from '@mmt/contracts';

/** 変更の要約が比べる、バージョンの部分。 */
export interface ReportRevisionContent {
  title: string;
  blocks: readonly ReportBlock[];
}

/** ブロックの種類1つとその数。種類が最初に現れた順。 */
export interface BlockTypeCount {
  type: ReportBlockType;
  count: number;
}

export interface ReportRevisionChanges {
  isTitleChanged: boolean;
  added: BlockTypeCount[];
  removed: BlockTypeCount[];
  edited: BlockTypeCount[];
  /** 両方のバージョンにあるブロックの並びが変わった。 */
  isReordered: boolean;
}

function countByType(blocks: readonly ReportBlock[]): BlockTypeCount[] {
  const counts = new Map<ReportBlockType, number>();
  for (const block of blocks) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count }));
}

export function reportRevisionChanges(previous: ReportRevisionContent, current: ReportRevisionContent): ReportRevisionChanges {
  const previousById = new Map(previous.blocks.map((block) => [block.id, block]));
  const currentIds = new Set(current.blocks.map((block) => block.id));
  const kept = current.blocks.filter((block) => previousById.has(block.id));
  const keptPreviousOrder = previous.blocks.filter((block) => currentIds.has(block.id)).map((block) => block.id);
  return {
    isTitleChanged: previous.title !== current.title,
    added: countByType(current.blocks.filter((block) => !previousById.has(block.id))),
    removed: countByType(previous.blocks.filter((block) => !currentIds.has(block.id))),
    edited: countByType(kept.filter((block) => JSON.stringify(block) !== JSON.stringify(previousById.get(block.id)))),
    isReordered: kept.some((block, index) => block.id !== keptPreviousOrder[index]),
  };
}

export function hasRevisionChanges(changes: ReportRevisionChanges): boolean {
  return (
    changes.isTitleChanged ||
    changes.isReordered ||
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.edited.length > 0
  );
}
