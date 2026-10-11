import { describe, expect, it } from 'vitest';
import type { Project } from '@mmt/contracts';
import { buildProjectPatch, projectSettingsImpact } from './projectSettingsChanges';

const project = {
  id: 'p1',
  description: 'old',
  visibility: 'private',
  artifactBackend: 'filesystem',
} as Project;

describe('プロジェクト設定の保存前の確認', () => {
  it('説明だけを変えたときは確認しない', () => {
    const patch = buildProjectPatch(project, {
      description: 'new',
      visibility: 'private',
      artifactBackend: 'filesystem',
    });
    expect(patch).toEqual({ description: 'new' });
    expect(projectSettingsImpact(project, patch)).toBeNull();
  });

  it('公開範囲と保存先を変えたときは、変わる先と元の保存先を確認に出す', () => {
    const patch = buildProjectPatch(project, {
      description: 'old',
      visibility: 'public',
      artifactBackend: 's3-main',
    });
    expect(projectSettingsImpact(project, patch)).toEqual({
      visibility: 'public',
      artifactBackend: { from: 'filesystem', to: 's3-main' },
    });
  });
});
