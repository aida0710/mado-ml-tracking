import { setLocale } from './locale';

// The web unit tests run outside a browser, where the app would start in English, and most of
// them assert the Japanese text; tests that need English switch with setLocale('en').
setLocale('ja');
