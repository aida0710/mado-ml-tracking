// 全体設定's frame: the way back to the Project screen it was opened from, and why a link to a
// 全体管理 screen showed the account instead.
export const settingsShellText = {
  adminOnlyRedirectNotice:
    '開こうとした画面は全体管理者だけが使えます。代わりにアカウントの画面を表示しています。',
} as const;

export const settingsShellTextTemplates = {
  settingsReturnToProject: (projectName: string) => `「${projectName}」に戻る`,
};
