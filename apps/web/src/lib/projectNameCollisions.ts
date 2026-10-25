import type { Project } from '@mmt/contracts';

// 画面で同じに見える名前は同じとみなす。全角と半角の文字、大文字と小文字、名前の前後の空白を
// 区別しない。
function comparableName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase();
}

/** 利用者が見られるProjectに、この名前のものがすでにあるか。 */
export function isProjectNameTaken(name: string, existingNames: readonly string[]): boolean {
  const typed = comparableName(name);
  return typed !== '' && existingNames.some((existing) => comparableName(existing) === typed);
}

/**
 * 一覧のほかのProjectと名前が重なるProjectのid。これらの行は、Projectの切り替えと完全な削除の
 * 前で見分けられるよう、作成日を添える必要がある。
 */
export function idsOfSharedNames(projects: readonly Pick<Project, 'id' | 'name'>[]): Set<string> {
  const countByName = new Map<string, number>();
  for (const project of projects) {
    const name = comparableName(project.name);
    countByName.set(name, (countByName.get(name) ?? 0) + 1);
  }
  return new Set(
    projects
      .filter((project) => (countByName.get(comparableName(project.name)) ?? 0) > 1)
      .map((project) => project.id),
  );
}
