import type { Project } from '@mmt/contracts';

// Projectがこの数以上になると、Projectの切り替えの一覧がスクロールなしに収まらないので、
// 名前で一覧を絞り込む欄を出す。
export const PROJECT_FILTER_THRESHOLD = 8;

export function shouldOfferProjectFilter(projectCount: number): boolean {
  return projectCount >= PROJECT_FILTER_THRESHOLD;
}

// 全角と半角の文字、大文字と小文字を区別せずに一致させる。
function normalizeForMatching(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

/** 名前に`query`のすべての語を含むProject。元の順のまま。 */
export function filterProjects<T extends Pick<Project, 'name'>>(projects: T[], query: string): T[] {
  const words = normalizeForMatching(query).split(/\s+/).filter(Boolean);
  if (!words.length) return projects;
  return projects.filter((project) => {
    const name = normalizeForMatching(project.name);
    return words.every((word) => name.includes(word));
  });
}
