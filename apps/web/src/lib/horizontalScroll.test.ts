import { describe, expect, it } from 'vitest';
import { hiddenEdges, scrollLeftToReveal } from './horizontalScroll';

describe('横にずらせる枠で隠れている端', () => {
  it('中身が収まっていれば、どちらの端も隠れていない', () => {
    expect(hiddenEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toBeNull();
  });

  it('左端にいるときは右だけ、右端までずらすと左だけ、途中では両方が隠れている', () => {
    expect(hiddenEdges({ scrollLeft: 0, clientWidth: 360, scrollWidth: 680 })).toBe('end');
    expect(hiddenEdges({ scrollLeft: 320, clientWidth: 360, scrollWidth: 680 })).toBe('start');
    expect(hiddenEdges({ scrollLeft: 100, clientWidth: 360, scrollWidth: 680 })).toBe('both');
  });

  it('1px に満たない端数の残りは隠れているとみなさない', () => {
    expect(hiddenEdges({ scrollLeft: 0.6, clientWidth: 360, scrollWidth: 680 })).toBe('end');
    expect(hiddenEdges({ scrollLeft: 319.4, clientWidth: 360, scrollWidth: 680 })).toBe('start');
  });
});

describe('選んだ項目を見える位置へずらす量', () => {
  const view = { scrollLeft: 0, clientWidth: 360, margin: 32 };

  it('両端から余白を空けて見えている項目では、位置を変えない', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 100, itemEnd: 200 })).toBe(0);
  });

  it('右に隠れた項目は、右端から余白を空けたところまで最小限ずらす', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 500, itemEnd: 580 })).toBe(580 + 32 - 360);
  });

  it('左に隠れた項目は、左端から余白を空けたところまで戻す', () => {
    expect(scrollLeftToReveal({ ...view, scrollLeft: 300, itemStart: 120, itemEnd: 200 })).toBe(120 - 32);
  });

  it('先頭の項目へ戻るときは 0 より左へずらさない', () => {
    expect(scrollLeftToReveal({ ...view, scrollLeft: 300, itemStart: 0, itemEnd: 80 })).toBe(0);
  });

  it('余白の間に収まらない幅の項目は、先頭をそろえる', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 400, itemEnd: 800 })).toBe(400 - 32);
  });
});
