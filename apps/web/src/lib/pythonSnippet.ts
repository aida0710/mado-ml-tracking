/**
 * A Python string literal for a value written into an example. JSON's escapes (\" \\ \n \uXXXX)
 * mean the same in Python, and other characters are valid as they are in UTF-8 source.
 */
export function pythonString(value: string): string {
  return JSON.stringify(value);
}
