import { getIntlLocale } from './locale';

/*
 * Intlのformatterは作るほうが使うよりはるかに遅く、ログの行や表のセルごとに使うものもある。
 * そこで、formatterは表示言語ごとに1回だけ作って使い回す。
 */

/**
 * `createFormatter`を、Intlのロケールごとに1回だけ動くように包む。返す関数は今の表示言語の
 * formatterを返す。呼び出し側が言語を固定したいときは`intlLocale`のformatterを返す。
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
