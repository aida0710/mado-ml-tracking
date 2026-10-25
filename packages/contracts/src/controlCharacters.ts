// ASCIIの制御文字（U+0000〜U+001F）とDEL（U+007F）。APIが保存する、またはworkerが実行する
// 名前・パス・キー・URLには含めてはならない。画面にもログにも見えず、いくつかはシェルや
// ファイルシステムが特別に扱うため。
// eslint-disable-next-line no-control-regex -- ここでは制御文字に一致させること自体が目的
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function containsControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER_PATTERN.test(value);
}
