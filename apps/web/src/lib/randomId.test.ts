import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandomId } from './randomId';

describe('createRandomId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('呼ぶたびに別の32桁の16進数を返す', () => {
    const id = createRandomId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(createRandomId()).not.toBe(id);
  });

  it('crypto.randomUUID の無い http の画面でも作れる', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(createRandomId()).toMatch(/^[0-9a-f]{32}$/);
  });
});
