/**
 * `value`に対して出す意味のある候補。入力済みの値と同じ候補は何も足さないので外す（外さないと、
 * 候補を選んだ後もその候補が出続ける）。
 */
export function remainingSuggestions(items: string[], value: string): string[] {
  return items.filter((item) => item !== value);
}
