export const projectAccessText = {
  addMember: 'Add member',
  editMember: 'Edit member',
  removeMember: 'Remove direct membership',
  remove: 'Remove',
  memberUser: 'User',
  effectiveRole: 'Effective role',
  directRole: 'Direct membership role',
  memberSources: 'Permission source',
  memberSourceDirect: 'Direct membership',
  memberGrantedByGroup: 'Granted by Authentik group',
  memberDisabled: 'Disabled',
  memberDisabledHint: 'This account is disabled. The user cannot sign in or use tokens even if a role is assigned.',
  memberPublicRoleHint:
    'This project is public, so anyone who can sign in can edit it as an editor, even with the Viewer role.',
  memberPublicViewerHint:
    "This project is public, so a member with the Viewer role can still edit it as an editor. To make it view-only, set the project's visibility to Private.",
  memberServiceAccount: 'Service account',
  memberServiceAccountHint:
    'This is a service account. Change its role in the Service accounts section. If you remove it here, it can no longer be issued tokens.',
  memberServiceAccountManaged: 'Change in Service accounts',
  directRoleHint:
    'A higher role granted by a group becomes the effective role. Change group permissions in the Authentik groups section.',
  userSearchPlaceholder: 'Search by name, email, or username prefix',
  userSearchNoResults: 'No matching users',
  userSearchRequired: 'Select a user to add',
  changeSelectedUser: 'Choose again',
  lastProjectAdminConflict:
    'This would leave the project without an administrator. First grant the Admin role to another member, or to a group that someone has signed in with.',
  lastProjectAdminLocked:
    'This is the last admin, so it cannot be changed or removed. First grant the Admin role to another member, or to a group that someone has signed in with.',
  groupWithoutMembers: 'No one has signed in yet',
  groupWithoutMembersHint:
    'No one has signed in with this group yet. Check that the group name is correct. Until someone signs in, this group does not count as a remaining admin, even with the Admin role.',
  groupBindings: 'Authentik group',
  groupBindingsDescription:
    'Grants a role to every group member. Group membership is synchronized from Authentik at SSO sign-in.',
  groupBindingsEmpty: 'No group permissions yet',
  addGroupBinding: 'Add group',
  editGroupBinding: 'Edit group role',
  removeGroupBinding: 'Remove group permissions',
  groupName: 'Group name',
  groupNameHint: "Suggestions come from signed-in users' groups. You can also enter a group name not listed.",
  grantedAt: 'Granted at',
} as const;

// 値を埋め込む文言。
export const projectAccessTextTemplates = {
  memberSourceGroup: (group: string) => `group ${group}`,
  memberPublicRole: (role: string) => `${role} (Public)`,
  removeMemberConfirm: (removal: { displayName: string; keepsGroupRole: boolean; isSelf: boolean }) =>
    (removal.isSelf
      ? 'Remove your own direct membership?'
      : `Remove the direct membership of “${removal.displayName}”?`) +
    (removal.keepsGroupRole
      ? ' Roles granted by groups are kept.'
      : removal.isSelf
        ? ' You will lose access to this project.'
        : ' This user will lose access to this project.'),
  memberAlreadyAdded: (role: string) =>
    `Already has the ${role} role. Use “Change” in the list to change it`,
  groupBindingExists: (group: string, role: string) =>
    `Group “${group}” already has the ${role} role. Use “Change” in the list to update it.`,
  removeGroupBindingConfirm: (group: string) =>
    `Remove permissions for group “${group}”? Users whose only role comes from this group will lose project access.`,
};
