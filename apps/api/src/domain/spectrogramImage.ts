import { encodeRgbPng } from './pngEncoder.js';
import { SPECTROGRAM_DB_FLOOR, type SpectrogramDecibels } from './spectrogramAccumulator.js';

// 画面のビューアのmagmaに似た色の段階（components/preview/AudioSpectrogram.tsx）。無音は
// 黒に近く、大きいbinは淡い色で、どちらのテーマでも読める。
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0, [0, 0, 4]],
  [0.25, [59, 15, 112]],
  [0.5, [140, 41, 129]],
  [0.75, [222, 73, 104]],
  [0.9, [254, 159, 109]],
  [1, [252, 253, 191]],
];
const COLOR_LEVELS = 256;

function buildColorTable(): Uint8Array {
  const table = new Uint8Array(COLOR_LEVELS * 3);
  for (let level = 0; level < COLOR_LEVELS; level += 1) {
    const position = level / (COLOR_LEVELS - 1);
    const upper = COLOR_STOPS.findIndex(([stop]) => stop >= position);
    const [highStop, highColor] = COLOR_STOPS[Math.max(1, upper)]!;
    const [lowStop, lowColor] = COLOR_STOPS[Math.max(0, upper - 1)]!;
    const ratio = highStop === lowStop ? 0 : (position - lowStop) / (highStop - lowStop);
    for (let component = 0; component < 3; component += 1)
      table[level * 3 + component] = Math.round(
        lowColor[component]! + (highColor[component]! - lowColor[component]!) * ratio,
      );
  }
  return table;
}
const colorTable = buildColorTable();

/** 列とbinごとに1ピクセル。低い周波数が下。ビューアが引き伸ばす。 */
export function renderSpectrogramPng(spectrogram: SpectrogramDecibels): Buffer {
  const width = Math.max(1, spectrogram.columnCount);
  const height = spectrogram.binCount;
  const pixels = new Uint8Array(width * height * 3);
  for (let column = 0; column < spectrogram.columnCount; column += 1)
    for (let bin = 0; bin < height; bin += 1) {
      const decibels = spectrogram.values[column * height + bin]!;
      const level = Math.round(
        ((decibels - SPECTROGRAM_DB_FLOOR) / -SPECTROGRAM_DB_FLOOR) * (COLOR_LEVELS - 1),
      );
      const pixel = ((height - 1 - bin) * width + column) * 3;
      pixels.set(colorTable.subarray(level * 3, level * 3 + 3), pixel);
    }
  return encodeRgbPng({ width, height, pixels });
}
