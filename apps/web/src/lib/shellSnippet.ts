/**
 * Lines of the shell examples people copy from the screen. A secret is never written into them:
 * it is read from the terminal with `read -s`, so it stays out of the page, the snippet and the
 * shell history.
 */

// Single quotes keep every character literal in POSIX shells.
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function exportLine(variable: string, value: string): string {
  return `export ${variable}=${shellQuote(value)}`;
}

export function promptedSecretLines(variable: string, prompt = 'API token'): string[] {
  return [`read -r -s -p ${shellQuote(`${prompt}: `)} ${variable}`, `export ${variable}`];
}

export function joinLines(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}
