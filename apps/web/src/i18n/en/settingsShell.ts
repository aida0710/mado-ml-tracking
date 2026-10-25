// 全体設定の枠。開く前にいたProjectの画面へ戻る道と、全体管理の画面へのリンクで代わりに
// アカウントを出したときの理由。
export const settingsShellText = {
  adminOnlyRedirectNotice:
    'The screen you tried to open is available only to global administrators. Your account is shown instead.',
} as const;

export const settingsShellTextTemplates = {
  settingsReturnToProject: (projectName: string) => `Back to “${projectName}”`,
};
