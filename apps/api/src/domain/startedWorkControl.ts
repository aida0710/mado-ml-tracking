import type { ProjectRole } from '@mmt/contracts';

/**
 * 1人が始めた作業（Runを通したJob、Sweep）を止める・再試行する・変えるのは、作成者と
 * Project adminだけ。editorが同僚の知らないうちにその学習を止められないようにするため。
 * 呼び出し元はeditorのroleを既に求めている。
 */
export function controlsStartedWork(
  caller: { role: ProjectRole; userId: string },
  work: { createdBy: string },
): boolean {
  return caller.role === 'admin' || work.createdBy === caller.userId;
}
