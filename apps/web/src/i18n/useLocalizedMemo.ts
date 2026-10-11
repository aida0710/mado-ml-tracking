import { useMemo, type DependencyList } from 'react';
import { useLocale } from './useLocale';

/** Recompute cached labels when their catalogs change, while preserving the caller's inputs. */
export function useLocalizedMemo<Value>(calculate: () => Value, dependencies: DependencyList): Value {
  const { locale } = useLocale();
  return useMemo(calculate, [...dependencies, locale]);
}
