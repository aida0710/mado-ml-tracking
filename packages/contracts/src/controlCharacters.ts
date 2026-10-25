// ASCII control characters (U+0000–U+001F) and DEL (U+007F). Names, paths, keys and URLs that the
// API stores or a worker runs must not carry them: they are invisible on screen and in logs, and
// shells and file systems treat several of them specially.
// eslint-disable-next-line no-control-regex -- matching control characters is the point here
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function containsControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER_PATTERN.test(value);
}
