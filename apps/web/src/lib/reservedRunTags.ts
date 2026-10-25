import { parseStringMap } from './formValues';
import { LocalizedError } from './localizedError';
import { automationText } from '../i18n/automation';

// APIのRESERVED_RUN_TAG_PREFIXES（domain/reservedRunTags.ts）に合わせる。サーバーが自分で
// 始めるRun（自動実行ルール、フック、array）にこれらのタグを付けるので、要求には含められない。
const RESERVED_TAG_PREFIXES = ['automation.', 'mmt.'] as const;

/** ルールやフックが始めるRunに利用者が付けるタグ。文字列のJSONオブジェクト。 */
export function parseUserRunTags(value: string): Record<string, string> {
  const tags = parseStringMap(value);
  const reserved = Object.keys(tags).find((key) =>
    RESERVED_TAG_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  if (reserved !== undefined) throw new LocalizedError(() => automationText.reservedTag(reserved));
  return tags;
}
