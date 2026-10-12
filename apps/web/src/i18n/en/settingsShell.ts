// Global settings' frame: the way back to the project screen it was opened from, and why a link
// to an Administration screen showed the account instead.
export const settingsShellText = {
  adminOnlyRedirectNotice:
    'The screen you tried to open is available only to global administrators. Your account is shown instead.',
} as const;

export const settingsShellTextTemplates = {
  settingsReturnToProject: (projectName: string) => `Back to “${projectName}”`,
};
