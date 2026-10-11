import { getIntlLocale } from './locale';

/*
 * Building an Intl formatter is far slower than using one, and some are used for every log line or
 * table cell. Each formatter is therefore built once per display language and reused.
 */

/**
 * Wraps `createFormatter` so that it runs once per Intl locale. The returned function gives the
 * formatter for the current display language, or for `intlLocale` when a caller needs a fixed one.
 */
export function memoizePerIntlLocale<Formatter>(
  createFormatter: (intlLocale: string) => Formatter,
): (intlLocale?: string) => Formatter {
  const formatters = new Map<string, Formatter>();
  return (intlLocale = getIntlLocale()) => {
    const cached = formatters.get(intlLocale);
    if (cached) return cached;
    const formatter = createFormatter(intlLocale);
    formatters.set(intlLocale, formatter);
    return formatter;
  };
}
