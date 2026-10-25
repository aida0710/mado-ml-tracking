/** Reactのキーボードイベントのうち、IMEが変換中かどうかを示す部分。 */
export type CompositionAwareKeyEvent = {
  key: string;
  keyCode: number;
  nativeEvent: { isComposing: boolean };
};

// ChromeとSafariは、IMEが処理したキーをこのkeyCode（"Process"）で知らせる。Safariは変換を確定する
// Enterを、compositionendの後にisComposingがfalseのままこの形で送る。
const IME_PROCESS_KEY_CODE = 229;

/**
 * キーが、変換中のIMEのもの（日本語入力など）か。変換を確定するEnterや、候補を移る↑↓がそれに
 * 当たる。キーの処理はこれらでは早めに戻るので、単語を確定しても、項目を選んだりフォームを
 * 送ったりはしない。
 */
export function isComposingKey(event: CompositionAwareKeyEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE;
}

/**
 * キーが、操作のために打ったEnter（周りのフォームを送る、項目を選ぶ）で、IMEの変換を確定する
 * Enterではないか。
 */
export function isEnterOutsideComposition(event: CompositionAwareKeyEvent): boolean {
  return event.key === 'Enter' && !isComposingKey(event);
}
