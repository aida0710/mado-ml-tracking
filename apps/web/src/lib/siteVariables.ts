import { MAX_SITE_VARIABLES, SITE_VARIABLE_NAME_PATTERN } from '@mmt/contracts';
import { LocalizedError } from './localizedError';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

const NAME_VALUE_SEPARATOR = '=';

/**
 * NAME=VALUEの行（1行に1つ）から読む、siteまたは個人の変数。空行は飛ばし、名前と値の前後の
 * 空白は取り除く（値には"="を含めてよい）。
 */
export function parseSiteVariables(lines: string): Record<string, string> {
  const variables = new Map<string, string>();
  for (const line of lines.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry) continue;
    const separator = entry.indexOf(NAME_VALUE_SEPARATOR);
    const name = entry.slice(0, Math.max(separator, 0)).trim();
    if (separator < 0 || !SITE_VARIABLE_NAME_PATTERN.test(name))
      throw new LocalizedError(() => siteComputersTextTemplates.siteVariableLineError(entry));
    if (variables.has(name)) throw new LocalizedError(() => siteComputersTextTemplates.siteVariableDuplicate(name));
    variables.set(name, entry.slice(separator + 1).trim());
  }
  if (variables.size > MAX_SITE_VARIABLES)
    throw new LocalizedError(() => siteComputersTextTemplates.siteVariablesTooMany(MAX_SITE_VARIABLES));
  // fromEntriesは自身のプロパティとして定義するので、__proto__のような名前もただの項目のままになる。
  return Object.fromEntries(variables);
}

/** フォームで編集する形の変数。保存された順に並べたNAME=VALUEの行。 */
export function formatSiteVariables(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `${name}${NAME_VALUE_SEPARATOR}${value}`)
    .join('\n');
}
