/**
 * 例に書き込む値のPythonの文字列リテラル。JSONのエスケープ（\" \\ \n \uXXXX）はPythonでも同じ
 * 意味で、ほかの文字もUTF-8のソースではそのまま有効。
 */
export function pythonString(value: string): string {
  return JSON.stringify(value);
}
