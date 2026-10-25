import { LoginHeader as DesignSystemLoginHeader } from '@mado/design-system/react';
import { LanguagePicker } from './LanguagePicker';
import { ProductLogo } from './ProductLogo';

/** ログインと最初のパスワード変更のカードの上端。ロゴの右に、ログイン前から選べる表示言語を置く。 */
export function LoginHeader() {
  return <DesignSystemLoginHeader logo={<ProductLogo />} languagePicker={<LanguagePicker />} />;
}
