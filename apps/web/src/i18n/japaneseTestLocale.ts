import { setLocale } from './locale';

// Webの単体テストはブラウザの外で動き、そこではアプリが英語で始まる。テストの多くは日本語の
// 文言を確かめる。英語が要るテストはsetLocale('en')で切り替える。
setLocale('ja');
