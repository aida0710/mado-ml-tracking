/** 横にスクロールする箱で、中身を隠している端。data属性に書く値の形。 */
export type HiddenEdges = 'start' | 'end' | 'both' | null;

// サブピクセルの配置で、scrollLeftがどちらかの端にわずかに届かないことがある。これは隠れた中身ではない。
const EDGE_TOLERANCE_PX = 1;

export function hiddenEdges({
  scrollLeft,
  clientWidth,
  scrollWidth,
}: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): HiddenEdges {
  const hidesStart = scrollLeft > EDGE_TOLERANCE_PX;
  const hidesEnd = scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX;
  if (hidesStart && hidesEnd) return 'both';
  if (hidesStart) return 'start';
  return hidesEnd ? 'end' : null;
}

/**
 * 項目を、各端から`margin`の余白（隠れた端がフェードする所）を残して見える所へ出すscrollLeft。
 * 動きはできるだけ小さくする。両端から既に離れている項目では今の位置のまま、余白の間より幅の
 * 広い項目は先頭をそろえる。位置は箱の中身の座標で、itemStartは中身の左端から項目までの距離。
 */
export function scrollLeftToReveal({
  itemStart,
  itemEnd,
  scrollLeft,
  clientWidth,
  margin,
}: {
  itemStart: number;
  itemEnd: number;
  scrollLeft: number;
  clientWidth: number;
  margin: number;
}): number {
  const viewStart = scrollLeft + margin;
  const viewEnd = scrollLeft + clientWidth - margin;
  if (itemStart < viewStart || itemEnd - itemStart > viewEnd - viewStart)
    return Math.max(0, itemStart - margin);
  if (itemEnd > viewEnd) return itemEnd + margin - clientWidth;
  return scrollLeft;
}
