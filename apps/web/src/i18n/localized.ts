import { getLocale } from './locale';
import { registerMessage } from './messageTranslations';

export type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : T[Key];
};

type CatalogPair = { ja: Record<string, unknown>; en: Record<string, unknown> };
const catalogs = new WeakMap<object, CatalogPair>();

/** Resolve strings and templates when read, including callers outside React. */
export function localized<T extends object>(japanese: T, english: TranslationShape<T>): TranslationShape<T> {
  const pair = { ja: japanese, en: english } as CatalogPair;
  for (const key of Object.keys(japanese)) {
    const original = Object.getOwnPropertyDescriptor(japanese, key)?.value;
    const translation = Object.getOwnPropertyDescriptor(english, key)?.value;
    if (typeof original === 'string' && typeof translation === 'string') {
      registerMessage(original, translation);
    }
  }
  const translated = new Proxy(japanese, {
    get(_target, key) {
      return Reflect.get(pair[getLocale()], key);
    },
  }) as TranslationShape<T>;
  catalogs.set(translated, pair);
  return translated;
}

/** Object spread would capture the language at module load instead of following later changes. */
export function mergeTranslations<const T extends readonly object[]>(sources: T): TranslationShape<UnionToIntersection<T[number]>> {
  const japanese = {};
  const english = {};
  for (const source of sources) {
    const pair = catalogs.get(source);
    if (!pair) throw new Error('Expected a localized translation catalog');
    Object.defineProperties(japanese, Object.getOwnPropertyDescriptors(pair.ja));
    Object.defineProperties(english, Object.getOwnPropertyDescriptors(pair.en));
  }
  return localized(japanese, english) as TranslationShape<UnionToIntersection<T[number]>>;
}

type UnionToIntersection<Union> =
  (Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void
    ? Intersection
    : never;
