import { useMemo, type DependencyList } from 'react';
import { useLocale } from './useLocale';

/** カタログが変わったら、呼び出し側の依存の指定を保ったまま、キャッシュした文言を計算し直す。 */
export function useLocalizedMemo<Value>(calculate: () => Value, dependencies: DependencyList): Value {
  const { locale } = useLocale();
  // 依存は呼び出し側が挙げ、exhaustive-depsが呼び出し側でその一覧を検査する（eslint.config.jsの
  // additionalHooks）。ここではカタログの言語だけを足す。
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- 呼び出し側で検査済みの一覧をそのまま渡す
  return useMemo(calculate, [...dependencies, locale]);
}
