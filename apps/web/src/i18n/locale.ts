import { createLocaleStore, type Locale } from '@mado/design-system/locale';

export type { Locale };

// 表示言語の保存キー。mado S3 Data Catalogの設定と分ける。
const LOCALE_STORAGE_KEY = 'mmt.locale';

/** 保存した言語、無ければブラウザの優先言語、それも無ければ英語（デザインシステムのcreateLocaleStore）。 */
export const localeStore = createLocaleStore({ storageKey: LOCALE_STORAGE_KEY });

/**
 * 言語ごとのIntlの言語。言語が決まっている文言（日本語の辞書の数の書き方など）で使う。今の表示言語の
 * ものはgetIntlLocale。
 */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { ja: 'ja-JP', en: 'en-US' };

export const getLocale = (): Locale => localeStore.getLocale();
export const getIntlLocale = (): string => localeStore.getIntlLocale();
export const setLocale = (next: Locale): void => localeStore.setLocale(next);
