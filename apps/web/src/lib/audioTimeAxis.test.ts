import { describe, expect, it } from 'vitest';
import { formatTickTime, timeAxisStep, timeAxisTicks } from './audioTimeAxis';

describe('音声の目盛り', () => {
  it('全体（90秒）を8本までで刻むと15秒ごとになり、両端の時刻も目盛りに入る', () => {
    const ticks = timeAxisTicks({ startSeconds: 0, endSeconds: 90 }, 8);
    expect(ticks.map((tick) => tick.label)).toEqual(['0:00', '0:15', '0:30', '0:45', '1:00', '1:15', '1:30']);
    expect(ticks[0]!.fraction).toBe(0);
    expect(ticks.at(-1)!.fraction).toBe(1);
  });

  it('拡大した範囲では、範囲の内側の切りのよい時刻に、間隔に合った桁数で目盛りを置く', () => {
    const ticks = timeAxisTicks({ startSeconds: 2.25, endSeconds: 6.75 }, 8);
    expect(ticks.map((tick) => tick.label)).toEqual(['0:03', '0:04', '0:05', '0:06']);
    expect(ticks[0]!.fraction).toBeCloseTo(0.75 / 4.5);
    const fine = timeAxisTicks({ startSeconds: 1, endSeconds: 1.3 }, 4);
    expect(fine.map((tick) => tick.label)).toEqual(['0:01.0', '0:01.1', '0:01.2', '0:01.3']);
  });

  it('最も拡大した0.05秒の範囲でも、1/100秒まで出して目盛りを区別できる', () => {
    const ticks = timeAxisTicks({ startSeconds: 10, endSeconds: 10.05 }, 6);
    expect(ticks.map((tick) => tick.label)).toEqual(['0:10.00', '0:10.01', '0:10.02', '0:10.03', '0:10.04', '0:10.05']);
  });

  it('一覧より長い音声は10分の倍数で刻み、範囲が無ければ目盛りも無い', () => {
    expect(timeAxisStep(3 * 3600, 6)).toBe(1800);
    expect(formatTickTime(5400, 1800)).toBe('90:00');
    expect(timeAxisTicks({ startSeconds: 0, endSeconds: 0 }, 8)).toEqual([]);
    expect(timeAxisTicks({ startSeconds: 0, endSeconds: 10 }, 0)).toEqual([]);
  });
});
