import { describe, expect, it } from 'vitest';
import type { Project } from '@mmt/contracts';
import { splitProjectList } from './projectListSections';

const project = (id: string, overrides: Pick<Project, 'isMember' | 'visibility'>) =>
  ({ id, name: id, role: 'admin', ...overrides }) as Project;

describe('プロジェクトの一覧の画面の分け方', () => {
  it('メンバーのプロジェクトと、メンバーでなくても入れるPublicのプロジェクトに分ける', () => {
    const mine = project('mine', { isMember: true, visibility: 'private' });
    const minePublic = project('mine-public', { isMember: true, visibility: 'public' });
    const othersPublic = project('others-public', { isMember: false, visibility: 'public' });
    expect(splitProjectList([mine, othersPublic, minePublic])).toEqual({
      memberProjects: [mine, minePublic],
      publicProjects: [othersPublic],
    });
  });

  it('全体管理者として見えるだけの他人のPrivateは、どちらにも並べない', () => {
    const othersPrivate = project('others-private', { isMember: false, visibility: 'private' });
    expect(splitProjectList([othersPrivate])).toEqual({ memberProjects: [], publicProjects: [] });
  });
});
