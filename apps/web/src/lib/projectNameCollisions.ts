import type { Project } from '@mmt/contracts';

// Names that look the same on screen count as the same: full-width and half-width letters, either
// case, and spaces around the name.
function comparableName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase();
}

/** Whether a Project the user can see already has this name. */
export function isProjectNameTaken(name: string, existingNames: readonly string[]): boolean {
  const typed = comparableName(name);
  return typed !== '' && existingNames.some((existing) => comparableName(existing) === typed);
}

/**
 * The Projects whose name another Project in the list shares, by id: those rows need their
 * creation date to be told apart, in the switcher and before one is purged.
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
