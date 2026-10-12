import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * The mark of three stacked layers: the top one in the accent color and the two below in the text
 * color, records piling up as versions. The shape is the browser tab's icon (public/favicon.svg);
 * its color and size are .product-mark in styles/productLogo.css.
 */
export function TrackingMark() {
  useLocale();
  return (
    <svg className="product-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="product-mark-layer" d="M3 12.25L12 16.75L21 12.25" />
      <path className="product-mark-layer" d="M3 16.75L12 21.25L21 16.75" />
      <path className="product-mark-top" d="M12 2.75L21 7.25L12 11.75L3 7.25Z" />
    </svg>
  );
}

/**
 * The product logo: the mark next to "mado ML Tracking". As in every mado product, the leading "mado"
 * has the regular weight and the product part is bold, set alike in the top bar, the drawer and the
 * login screen. With isNameVisuallyHidden only the mark shows, and the name stays for screen readers
 * and the link's name (the top bar below --bp-xs).
 */
export function ProductLogo({ isNameVisuallyHidden = false }: { isNameVisuallyHidden?: boolean }) {
  useLocale();
  return (
    <span className="product-logo">
      <TrackingMark />
      <span className={isNameVisuallyHidden ? 'sr-only' : 'product-name'}>
        <span className="product-prefix">{text.appNamePrefix}</span>{' '}
        <strong>{text.appNameProduct}</strong>
      </span>
    </span>
  );
}
