import { Dialog as DesignSystemDialog, type DialogProps } from '@mado/design-system/react';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * モーダルのダイアログ（デザインシステムのDialog）に、閉じるボタンの読み上げの名前を表示言語で入れたもの。
 * 開いている間だけ描く（`{open && <XxxDialog />}`）。処理中は`dismissible={false}`にして閉じさせない。
 */
export function Dialog(props: Omit<DialogProps, 'closeLabel'>) {
  useLocale();
  return <DesignSystemDialog {...props} closeLabel={text.close} />;
}
