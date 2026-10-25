import { describe, expect, it, vi } from 'vitest';

// APIクライアントはコードとサーバーのメッセージだけを伝え、画面の文はlib/errorMessage.tsが選ぶ。
vi.mock('../i18n/catalog', () => {
  throw new Error('API clients must not import the i18n catalog');
});

describe('APIクライアントと画面文言の分離', () => {
  it('APIクライアントはi18nカタログを読み込まずに使える', async () => {
    const modules = import.meta.glob(['./*.ts', '!./*.test.ts']);
    await expect(Promise.all(Object.values(modules).map((load) => load()))).resolves.toHaveLength(
      Object.keys(modules).length,
    );
  });
});
