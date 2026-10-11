export const projectsText = {
  projectSwitcherPlaceholder: "Select project",
  projectSwitcherFilter: "Filter projects",
  projectDescriptionOptional: "Description (optional)",
  projectVisibility: "Visibility",
  public: 'Public',
  private: 'Private',
  projectVisibilityPublicHint: "Everyone who can sign in can view and edit as an editor without being added as a member.",
  projectVisibilityPrivateHint: "Only added members can view this project.",
  projectInitialMembers: "Members (optional)",
  projectInitialMembersHint:
    "You will be added as an admin. Add other users here or later in project settings.",
  projectMembersPublicNote:
    "This project is public. Everyone who can sign in can view and edit as an editor without membership. The list below shows only direct and group members. Only members can be admins.",
  projectMembersPrivateNote:
    "This project is private. Only direct and group members can view it.",
  projectArchive: "Archive",
  projectArchiveTitle: "Archive project",
  projectArchiveDescription:
    "Archiving hides this project from lists and prevents access. Run, model, and artifact data is retained. A global administrator can restore it from Administration → Projects. Projects with queued or running jobs cannot be archived.",
  projectHasActiveJobs:
    "This project has queued or running jobs and cannot be archived. Wait for them to finish or stop them on the Jobs screen, then try again.",
  projectNotArchived:
    "Only archived projects can be permanently deleted. Archive this project first.",
  adminProjectsDescription:
    "All projects. Member counts include direct and group members, but exclude users with public access only.",
  adminProjectsEmpty: "No projects yet",
  projectIncludeArchived: "Include archived projects",
  projectMemberCount: "Members",
  projectRunCount: "Runs",
  projectStateActive: "Enabled",
  projectStateArchived: "Archived",
  projectRestore: "Restore",
  projectRestoreTitle: "Restore project",
  projectPurge: "Delete permanently",
  projectPurgeTitle: "Permanently delete project",
  projectPurgeNameLabel: "Enter the project name to confirm",
} as const;

// Text that embeds values.
export const projectsTextTemplates = {
  projectArchiveConfirm: (name: string) =>
    `Archive “${name}”? Run, model, and artifact data is retained and can be restored from Administration → Projects.`,
  projectRestoreConfirm: (name: string) =>
    `Restore “${name}”? Membership and data will be available as before archiving.`,
  projectPurgeConfirm: (name: string) =>
    `Permanently delete “${name}”? All runs, models, datasets, artifacts (including stored files), and membership settings will be deleted. This cannot be undone.`,
  projectMemberRole: (displayName: string) => `Role for ${displayName}`,
  projectMemberRemove: (displayName: string) => `Remove ${displayName}`,
  projectArchivedAt: (date: string) => `Archive ${date}`,
};
