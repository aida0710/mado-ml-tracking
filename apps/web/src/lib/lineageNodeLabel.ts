/** 長い名前は両端を残し、先頭が同じ項目どうしも見分けられるようにする。 */
export function shortenLineageLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  const tail = Math.floor((maxLength - 1) / 3);
  const head = maxLength - 1 - tail;
  return `${label.slice(0, head)}…${label.slice(label.length - tail)}`;
}
