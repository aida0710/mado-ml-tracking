export const projectAccessText = {
  addMember: "Add member",
  editMember: "Edit member",
  removeMember: "Remove direct membership",
  remove: "Remove",
  memberUser: "User",
  effectiveRole: "Effective role",
  directRole: "Direct role",
  memberSources: "Permission source",
  memberSourceDirect: "Direct membership",
  memberGrantedByGroup: "Granted by Authentik group",
  memberDisabled: "Disabled",
  memberDisabledHint: "This account is disabled. The user cannot sign in or use tokens even if a role is assigned.",
  directRoleHint:
    "A higher role granted by a group becomes the effective role. Change group permissions in the Authentik groups section.",
  userSearchPlaceholder: "Search by name, email, or username prefix",
  userSearchNoResults: "No matching users",
  userSearchRequired: "Select a user to add",
  changeSelectedUser: "Choose again",
  lastProjectAdminConflict:
    "This would leave the project without an administrator. Grant admin to another member or group first.",
  groupBindings: 'Authentik group',
  groupBindingsDescription:
    "Grants a role to every group member. Group membership is synchronized from Authentik at SSO sign-in.",
  groupBindingsEmpty: "No group permissions yet",
  addGroupBinding: "Add group",
  editGroupBinding: "Edit group role",
  removeGroupBinding: "Remove group permissions",
  groupName: "Group name",
  groupNameHint: "Suggestions come from signed-in users' groups. You can also enter a group name not listed.",
  grantedAt: "Granted at",
} as const;

// Text that embeds values.
export const projectAccessTextTemplates = {
  memberSourceGroup: (group: string) => `group ${group}`,
  removeMemberConfirm: (displayName: string, keepsGroupRole: boolean) =>
    `Remove direct permissions from “${displayName}”?` +
    (keepsGroupRole ? ' Roles granted by groups are kept.' : ' This user will lose access to this project.'),
  groupBindingExists: (group: string, role: string) =>
    `Group “${group}” already has the ${role} role. Use “Change” in the list to update it.`,
  removeGroupBindingConfirm: (group: string) =>
    `Remove permissions for group “${group}”? Users whose only role comes from this group will lose project access.`,
};
