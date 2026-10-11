export const artifactLifecycleText = {
  artifactActions: "File actions",
  artifactDelete: "Delete",
  artifactDeleteTitle: "Delete artifact",
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
    `Files of deleted artifacts are reclaimed after ${graceDays} days. Older versions are not deleted automatically.`,
  artifactUsageFiles: (count: number, size: string) => `${count} files · ${size}`,
};
