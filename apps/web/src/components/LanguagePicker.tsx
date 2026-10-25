import { LanguagePicker as DesignSystemLanguagePicker } from '@mado/design-system/react';
import { localeStore } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';
import { languageText } from '../i18n/language';

/** 表示言語の切り替え（デザインシステムのLanguagePicker）。上部バーに加え、ログイン前の画面でも使う。 */
export function LanguagePicker() {
  useLocale();
  return <DesignSystemLanguagePicker store={localeStore} label={languageText.language} />;
}
