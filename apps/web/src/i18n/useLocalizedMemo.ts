import { useMemo, type DependencyList } from 'react';
import { useLocale } from './useLocale';

/** Recompute cached labels when their catalogs change, while preserving the caller's inputs. */
export function useLocalizedMemo<Value>(calculate: () => Value, dependencies: DependencyList): Value {
  const { locale } = useLocale();
  // The caller lists the dependencies, and exhaustive-deps checks that list at the call site
  // (additionalHooks in eslint.config.js); only the catalog's language is added here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- forwards the caller's checked list
  return useMemo(calculate, [...dependencies, locale]);
}
