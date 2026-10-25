// スクリプトの撮影の一覧を実行する。全部か、コマンドラインで名前を指定したものだけ。

/** コマンドラインの名前に撮影の一覧に無いものがあれば、何かを実行する前に失敗する。 */
export function assertKnownCaptures(captures, names) {
  const unknown = names.filter((name) => !Object.hasOwn(captures, name));
  if (unknown.length) throw new Error(`unknown screenshot: ${unknown.join(', ')}`);
}

/**
 * 名前を指定した撮影（`only`が空なら全部）を1つずつ順に実行する。失敗した撮影は報告して残りを
 * 続け、1つでも失敗すれば終了コードを1にする。
 */
export async function runCaptures(captures, only, capture) {
  assertKnownCaptures(captures, only);
  const failed = [];
  for (const [name, prepare] of Object.entries(captures)) {
    if (only.length && !only.includes(name)) continue;
    try {
      await capture(name, prepare);
    } catch (error) {
      failed.push(name);
      console.log('FAILED', name, error.message.split('\n')[0]);
    }
  }
  if (failed.length) process.exitCode = 1;
  return failed;
}
