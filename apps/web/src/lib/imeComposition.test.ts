import { describe, expect, it } from 'vitest';
import { isComposingKey, isEnterOutsideComposition } from './imeComposition';

const keyEvent = ({
  key = 'Enter',
  keyCode,
  isComposing,
}: {
  key?: string;
  keyCode: number;
  isComposing: boolean;
}) => ({
  key,
  keyCode,
  nativeEvent: { isComposing },
});

describe('isComposingKey', () => {
  it('変換中のキー（isComposing）は変換の操作とみなす', () => {
    expect(isComposingKey(keyEvent({ keyCode: 13, isComposing: true }))).toBe(true);
  });

  it('keyCode 229 のキーは、isComposing が false でも変換の確定とみなす（Safari の確定の Enter）', () => {
    expect(isComposingKey(keyEvent({ keyCode: 229, isComposing: false }))).toBe(true);
  });

  it('変換していない Enter や矢印は通常のキー操作として扱う', () => {
    expect(isComposingKey(keyEvent({ keyCode: 13, isComposing: false }))).toBe(false);
    expect(isComposingKey(keyEvent({ keyCode: 40, isComposing: false }))).toBe(false);
  });
});

describe('isEnterOutsideComposition', () => {
  it('変換していない Enter だけを、フォームの送信や選択に使う Enter とみなす', () => {
    expect(isEnterOutsideComposition(keyEvent({ keyCode: 13, isComposing: false }))).toBe(true);
  });

  it('変換を確定する Enter（isComposing や keyCode 229）と、Enter 以外のキーは含めない', () => {
    expect(isEnterOutsideComposition(keyEvent({ keyCode: 13, isComposing: true }))).toBe(false);
    expect(isEnterOutsideComposition(keyEvent({ keyCode: 229, isComposing: false }))).toBe(false);
    expect(isEnterOutsideComposition(keyEvent({ key: 'a', keyCode: 65, isComposing: false }))).toBe(false);
  });
});
