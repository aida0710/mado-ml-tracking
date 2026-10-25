import * as english from './en/settingsShell';
import { localized } from './localized';
// 全体設定の枠。開く前にいたProjectの画面へ戻る道と、全体管理の画面へのリンクで代わりに
// アカウントを出したときの理由。
export const settingsShellText = localized({
  adminOnlyRedirectNotice:
    '開こうとした画面は全体管理者だけが使えます。代わりにアカウントの画面を表示しています。',
} as const, english.settingsShellText);

export const settingsShellTextTemplates = localized({
  settingsReturnToProject: (projectName: string) => `「${projectName}」に戻る`,
}, english.settingsShellTextTemplates);
