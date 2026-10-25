// click()の直後にobject URLを解放すると、ブラウザによってはダウンロードが取り消されるので、少し待つ。
const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

/** 取得したファイルを、`download`付きのリンクと同じようにブラウザのダウンロードへ渡す。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}
