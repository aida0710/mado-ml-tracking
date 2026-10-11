// WCAG 2.x contrast of sRGB colors, for drawing code that picks colors in JavaScript (chart lines)
// and must keep them readable on the theme's background.

/** Red, green and blue from 0 to 255. */
export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export function parseHexColor(hex: string): RgbColor {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return { red: value >> 16, green: (value >> 8) & 0xff, blue: value & 0xff };
}

export function toHexColor({ red, green, blue }: RgbColor): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** WCAG relative luminance: 0 for black, 1 for white. */
export function relativeLuminance({ red, green, blue }: RgbColor): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** From 1 (the same luminance) to 21 (black on white), whichever color is lighter. */
export function contrastRatio(left: RgbColor, right: RgbColor): number {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort(
    (first, second) => second - first,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** HSL to sRGB; hue in degrees, saturation and lightness from 0 to 1. */
export function hslToRgb({
  hue,
  saturation,
  lightness,
}: {
  hue: number;
  saturation: number;
  lightness: number;
}): RgbColor {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    return 255 * (lightness - (chroma / 2) * Math.max(-1, Math.min(position - 3, 9 - position, 1)));
  };
  return { red: channel(0), green: channel(8), blue: channel(4) };
}
