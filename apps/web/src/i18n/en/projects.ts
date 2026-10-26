import { formatEnglishCount } from '../formatEnglishCount';

export const projectsText = {
  projectSwitcherPlaceholder: 'Select project',
  projectSwitcherFilter: 'Filter projects',
  projectSwitcherNotMember: 'Not a member',
  projectSwitcherNotMemberHint:
    'You are not a member. You can open this project because it is public or you are a global administrator.',
  projectNameTakenHint:
    'A project with this name already exists. A different name is recommended, because projects with the same name are hard to tell apart in the project switcher.',
  projectDescriptionOptional: 'Description (optional)',
  projectVisibility: 'Visibility',
  public: 'Public',
  private: 'Private',
  projectVisibilityPublicHint: 'Everyone who can sign in can view and edit as an editor without being added as a member.',
  projectVisibilityPrivateHint: 'Only added members can view this project.',
  projectInitialMembers: 'Members (optional)',
  projectInitialMembersHint:
    'You will be added as an admin. Add other users here or later in project settings.',
  projectMembersPublicNote:
    'This project is public. Everyone who can sign in can view and edit as an editor without membership. The list below shows only direct and group members. Only members can be admins.',
  projectMembersPrivateNote:
    'This project is private. Only direct and group members can view it.',
  projectArchive: 'Archive',
  projectArchiveTitle: 'Archive project',
  projectArchiveDescription:
    'Archiving hides this project from lists and prevents access. Run, model, and artifact data is retained. A global administrator can restore it from Administration → Projects. Projects with queued or running jobs cannot be archived.',
  adminProjectsDescription:
    'All projects. Member counts include direct members, group members, and service accounts, but exclude users with public access only.',
  projectAdmins: 'Admins',
  projectAdminsNone: '(No admins)',
  adminProjectsEmpty: 'No projects yet',
  projectIncludeArchived: 'Include archived projects',
  projectMemberCount: 'Members',
  projectRunCount: 'Runs',
  projectStateActive: 'Enabled',
  projectStateArchived: 'Archived',
  projectRestore: 'Restore',
  projectRestoreTitle: 'Restore project',
  projectPurge: 'Delete permanently',
  projectPurgeTitle: 'Permanently delete project',
  projectPurgeNameLabel: 'Enter the project name to confirm',
  projectStorageChangeHint:
    'Changing the storage backend does not move existing artifacts; they stay in the current backend. Only artifacts saved from now on go to the new backend.',
  projectSettingsConfirmTitle: 'Confirm project settings changes',
  projectSettingsConfirmSave: 'Save changes',
  projectBecomesPublic:
    'Visibility will be set to Public. Everyone who can sign in will be able to view and edit this project as an editor. Members with the Viewer role will also be able to use it as editors.',
  projectBecomesPrivate:
    'Visibility will be set to Private. Users who are not members will no longer be able to view this project.',
  projectListMine: 'Your projects',
  projectListRole: 'Your role',
  projectListPublic: 'Projects open to non-members (Public)',
  projectListPublicHint:
    'Everyone who can sign in can use these projects as an editor. Runs and experiments you create after opening one belong to that project.',
  projectListAdminHint: 'Private projects you are not a member of are listed in Administration → Projects.',
  projectListAdminLink: 'Projects in Administration',
  projectArchivedNotAccessible:
    'This project is archived. To use it, ask a global administrator to restore it from Administration → Projects.',
  projectSettingsContents: 'Project settings sections',
} as const;

// 値を埋め込む文言。
export const projectsTextTemplates = {
  projectArchiveConfirm: (name: string) =>
    `Archive “${name}”? Run, model, and artifact data is retained, and the project can be restored from Administration → Projects.`,
  projectArchiveStops: (usableTokenCount: number | undefined) => {
    const tokens =
      usableTokenCount === undefined ? 'API tokens' : formatEnglishCount(usableTokenCount, 'API token');
    return `Archiving also disables ${tokens} limited to this project (including worker and service account tokens), stops running workers from receiving jobs, and stops sweeps, hooks, automation, and automatic promotion.`;
  },
  projectSwitcherCreatedAt: (date: string) => `Created ${date}`,
  projectPurgeIdentity: (dates: { createdAt: string; archivedAt: string }) =>
    `Created ${dates.createdAt} · Archived ${dates.archivedAt}`,
  projectArchived: (name: string) =>
    `Archived “${name}”. A global administrator can restore it from Administration → Projects.`,
  projectRestoreConfirm: (name: string) =>
    `Restore “${name}”? Membership and data will be available as before archiving.`,
  projectPurgeConfirm: (name: string) =>
    `Permanently delete “${name}”? All runs, models, datasets, artifacts (including stored files), and membership settings will be deleted. This cannot be undone. Stored files are removed after the deletion grace period (MMT_ARTIFACT_DELETE_GRACE_DAYS on the API server, 7 days by default). Audit logs are kept.`,
  projectMemberRole: (displayName: string) => `Role for ${displayName}`,
  projectMemberRemove: (displayName: string) => `Remove ${displayName}`,
  projectArchivedAt: (date: string) => `Archived ${date}`,
  projectSettingsAdminOnly: (adminNames: string) =>
    adminNames
      ? `Only this project's admins (${adminNames}) can change these settings. Ask an admin if you need a change.`
      : "Only this project's admins can change these settings. Ask an admin if you need a change.",
  projectStorageChange: (from: string, to: string) =>
    `The artifact storage backend will change from “${from}” to “${to}”. Existing artifacts stay in “${from}”; only artifacts saved from now on go to “${to}”.`,
};
