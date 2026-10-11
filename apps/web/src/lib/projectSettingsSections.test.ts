import { describe, expect, it } from 'vitest';
import { PROJECT_SETTINGS_SECTION_IDS, projectSettingsSections } from './projectSettingsSections';

describe('プロジェクト設定の目次', () => {
  it('Project adminにはすべての節を、ページの並びのとおりに出す', () => {
    expect(projectSettingsSections(true).map((section) => section.id)).toEqual(
      Object.values(PROJECT_SETTINGS_SECTION_IDS),
    );
  });

  it('Project admin以外には、見えない節（Service Accounts・通知・監査ログ・アーカイブ）を出さない', () => {
    const ids = projectSettingsSections(false).map((section) => section.id);
    expect(ids).toEqual([
      'settings-project',
      'settings-usage',
      'settings-connection',
      'settings-members',
      'settings-groups',
      'settings-tokens',
    ]);
  });
});
