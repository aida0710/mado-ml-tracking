import { formatEnglishCount } from '../formatEnglishCount';
export const artifactLifecycleText = {
  artifactActions: "File actions",
  artifactDelete: "Delete",
  artifactDeleteTitle: "Delete artifact",
  artifactDeleteBlockedByReferences:
    "This file is in use and cannot be deleted. First delete the versions or other items listed under “Used by”, or switch them to another file.",
  artifactUsage: "Artifact usage",
  artifactUsageEmpty: "No artifacts yet",
  artifactUsageBackend: "Storage backend",
  artifactUsageCount: "Count",
  artifactUsageBytes: "Capacity",
  artifactUsagePendingDeletion: "Pending deletion",
  artifactUsageOldVersions: "Unreferenced older versions",
};

export const artifactLifecycleTextTemplates = {
  artifactDeleteConfirm: (path: string) =>
    `Delete “${path}”? It disappears immediately from listings and downloads and cannot be restored. If an older version exists at the same path, it becomes visible.`,
  artifactUsageNote: (graceDays: number) =>
    `Files of deleted artifacts are reclaimed after ${formatEnglishCount(graceDays, 'day')}. Older versions are not deleted automatically.`,
  artifactUsageFiles: (count: number, size: string) => `${formatEnglishCount(count, 'file')} · ${size}`,
};
