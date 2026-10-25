/**
 * 画面からコピーするシェルの例の行。秘密の値は決して書き込まない。`read -s`で端末から読むので、
 * ページにも例にもシェルの履歴にも残らない。行はbashでもzsh（macOSの既定）でも同じように動く。
 */

// POSIXのシェルでは、シングルクォートの中はすべて文字どおりになる。
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function exportLine(variable: string, value: string): string {
  return `export ${variable}=${shellQuote(value)}`;
}

/**
 * 秘密の値を表示せずに尋ね、exportする。プロンプトをprintfで出すのは、`read -p`がbashでは
 * プロンプトだが、zshでは「コプロセスから読む」意味になるため。echoは、隠した入力が開いたままに
 * した行を終える。`prompt`は決まったラベルなので、printfがその中に%の指示を見つけることはない。
 */
export function promptedSecretLines(variable: string, prompt = 'API token'): string[] {
  return [`printf ${shellQuote(`${prompt}: `)}; read -r -s ${variable}; echo`, `export ${variable}`];
}

/** `variable`に、別の変数がすでに持つ値を入れる。秘密の値の入力を1回で済ませるため。 */
export function exportFromVariableLine(variable: string, sourceVariable: string): string {
  return `export ${variable}="$${sourceVariable}"`;
}

export function joinLines(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}
