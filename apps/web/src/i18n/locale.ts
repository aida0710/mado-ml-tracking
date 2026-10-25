import { createLocaleStore, type Locale } from '@mado/design-system/locale';

export type { Locale };

// 表示言語の保存キー。mado S3 Data Catalogの設定と分ける。
const LOCALE_STORAGE_KEY = 'mmt.locale';

/** 保存した言語、無ければブラウザの優先言語、それも無ければ英語（デザインシステムのcreateLocaleStore）。 */
export const localeStore = createLocaleStore({ storageKey: LOCALE_STORAGE_KEY });

export const getLocale = (): Locale => localeStore.getLocale();
export const getIntlLocale = (): string => localeStore.getIntlLocale();
export const setLocale = (next: Locale): void => localeStore.setLocale(next);
