import { ProductLogo as DesignSystemProductLogo } from '@mado/design-system/react';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 重なった3枚の層の印。上の層は強調色、下の2枚は文字色で、版として積み重なる記録を表す。形はブラウザの
 * タブのアイコン（public/favicon.svg）と同じ。
 */
function TrackingMark() {
  return (
    <svg className="product-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="product-mark-base" d="M3 12.25L12 16.75L21 12.25" />
      <path className="product-mark-base" d="M3 16.75L12 21.25L21 16.75" />
      <path className="product-mark-accent" d="M12 2.75L21 7.25L12 11.75L3 7.25Z" />
    </svg>
  );
}

/**
 * 製品のロゴ（デザインシステムのProductLogo）。印と「mado ML Tracking」を並べ、上部バー・ドロワー・
 * ログイン画面で同じ組み方にする。`compact`では名前を読み上げ用だけに残して印だけを見せる。
 */
export function ProductLogo({ compact = false }: { compact?: boolean }) {
  useLocale();
  return (
    <DesignSystemProductLogo
      mark={<TrackingMark />}
      prefix={text.appNamePrefix}
      name={text.appNameProduct}
      compact={compact}
    />
  );
}
