import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('英語で起動したあと日本語に切り替えると、別の辞書を参照するラベルも日本語になる', async () => {
  vi.resetModules();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { languages: ['en-US'] });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  const { setLocale } = await import('./locale');
  const { computeText, submissionModeBadgeLabels, targetCheckItemLabels } = await import('./compute');
  expect(computeText.submissionAutomaticBadge).toBe('Automatic submission');
  expect(submissionModeBadgeLabels.automatic).toBe('Automatic submission');
  expect(targetCheckItemLabels.connection).toBe('SSH connection');
  setLocale('ja');
  expect(computeText.submissionAutomaticBadge).toBe('自動投入');
  expect(submissionModeBadgeLabels.automatic).toBe('自動投入');
  expect(targetCheckItemLabels.connection).toBe('SSH接続');
});
