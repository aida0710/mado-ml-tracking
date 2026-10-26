// ブラウザ検査で、ページが画面の幅から横にはみ出さないことを確かめる。

/**
 * ページの横のはみ出しが無くなるのを待つ。幅を変えた直後は、開いているメニューなどがまだ前の幅で
 * 決めた位置にあり、位置を直すのは次の描画になる。はみ出したままなら、待ちの上限で`message`の
 * エラーにする。
 */
export async function waitForNoHorizontalOverflow(page, message) {
  try {
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  } catch (error) {
    throw new Error(message, { cause: error });
  }
}
