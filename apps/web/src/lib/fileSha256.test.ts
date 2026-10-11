import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256OfFile } from './fileSha256';

const MIB = 1024 * 1024;

describe('sha256OfFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Web Crypto の無い画面（http）でも、切り分けて読んだ値がファイル全体の SHA-256 になる', async () => {
    vi.stubGlobal('crypto', {});
    const bytes = randomBytes(16 * MIB + 5);
    expect(await sha256OfFile(new Blob([bytes]))).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('取り消すと、読み終える前に止まる', async () => {
    vi.stubGlobal('crypto', {});
    const controller = new AbortController();
    controller.abort();
    await expect(sha256OfFile(new Blob([randomBytes(1024)]), controller.signal)).rejects.toThrow();
  });
});
