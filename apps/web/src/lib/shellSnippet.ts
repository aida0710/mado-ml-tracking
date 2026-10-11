/**
 * Lines of the shell examples people copy from the screen. A secret is never written into them:
 * it is read from the terminal with `read -s`, so it stays out of the page, the snippet and the
 * shell history. The lines run in bash and zsh (the macOS default) alike.
 */

// Single quotes keep every character literal in POSIX shells.
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function exportLine(variable: string, value: string): string {
  return `export ${variable}=${shellQuote(value)}`;
}

/**
 * Asks for a secret without echoing it and exports it. The prompt is printed by printf because
 * `read -p` is bash's prompt but zsh's "read from the coprocess"; echo ends the line the hidden
 * input leaves open. `prompt` is a fixed label, so printf finds no % directive in it.
 */
export function promptedSecretLines(variable: string, prompt = 'API token'): string[] {
  return [`printf ${shellQuote(`${prompt}: `)}; read -r -s ${variable}; echo`, `export ${variable}`];
}

/** Sets `variable` to the value another variable already holds, so a secret is typed only once. */
export function exportFromVariableLine(variable: string, sourceVariable: string): string {
  return `export ${variable}="$${sourceVariable}"`;
}

export function joinLines(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}
