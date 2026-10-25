// 正解の書き起こしと予測の、文字単位の差分（CERのような見直しのため）。
// 文字はUnicodeのコードポイントなので、日本語の文字もサロゲートペアも1文字ずつ比べる。

export type TextDiffKind = 'equal' | 'delete' | 'insert';
/** 'delete'は正解にだけ、'insert'は予測にだけある。 */
export interface TextDiffSegment {
  kind: TextDiffKind;
  text: string;
}

/**
 * LCSの表のセルは(reference + 1) x (prediction + 1)個。400万セル（Uint32で16MB）で、2000文字の
 * 書き起こし2つまで収まる。それより長い組は、タブを固まらせる代わりに強調なしで表示する。
 */
export const TEXT_DIFF_MAX_CELLS = 4_000_000;

function appendSegment(segments: TextDiffSegment[], kind: TextDiffKind, character: string) {
  const last = segments[segments.length - 1];
  if (last?.kind === kind) last.text += character;
  else segments.push({ kind, text: character });
}

/** 文字列が長すぎて、TEXT_DIFF_MAX_CELLSの範囲で比べられないときはnullを返す。 */
export function diffCharacters(reference: string, prediction: string): TextDiffSegment[] | null {
  const left = Array.from(reference);
  const right = Array.from(prediction);
  const width = right.length + 1;
  if ((left.length + 1) * width > TEXT_DIFF_MAX_CELLS) return null;
  // lengths[i * width + j] = left[i..]とright[j..]のLCSの長さ。
  const lengths = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i -= 1)
    for (let j = right.length - 1; j >= 0; j -= 1)
      lengths[i * width + j] =
        left[i] === right[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
  const segments: TextDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      appendSegment(segments, 'equal', left[i]!);
      i += 1;
      j += 1;
    } else if (
      j >= right.length ||
      (i < left.length && lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)
    ) {
      appendSegment(segments, 'delete', left[i]!);
      i += 1;
    } else {
      appendSegment(segments, 'insert', right[j]!);
      j += 1;
    }
  }
  return segments;
}
