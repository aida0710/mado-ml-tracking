import { describe, expect, it } from 'vitest';
import type { Project } from '@mmt/contracts';
import { projectToOpen } from './lastOpenedProject';

const project = (id: string, isMember: boolean) => ({ id, name: id, isMember }) as Project;

describe('projectToOpen', () => {
  const othersPublic = project('others-public', false);
  const mine = project('mine', true);
  const projects = [othersPublic, mine, project('mine-older', true)];

  it('最後に開いたProjectがまだ一覧にあれば、メンバーでないPublicでもそれを開く', () => {
    expect(projectToOpen(projects, 'mine-older')?.id).toBe('mine-older');
    expect(projectToOpen(projects, 'others-public')?.id).toBe('others-public');
  });

  it('最後に開いたProjectが無い・開けなくなったときは、メンバーのうち新しいものを開く', () => {
    expect(projectToOpen(projects, null)?.id).toBe('mine');
    expect(projectToOpen(projects, 'archived')?.id).toBe('mine');
  });

  it('メンバーのProjectが無ければ、他人のPublicや全体管理者として見えるProjectにも入らない', () => {
    expect(projectToOpen([othersPublic, project('others-private', false)], null)).toBeUndefined();
  });

  it('Projectが1つも無ければ何も開かない', () => {
    expect(projectToOpen([], 'older')).toBeUndefined();
  });
});
