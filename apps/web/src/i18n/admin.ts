import * as english from './en/admin';
import { localized } from './localized';
// 全体設定 (/settings/<section>): its two sidebar groups, the 全体管理 sections, the user menu and
// the account page.
export const adminText = localized({
  globalSettings: '全体設定',
  administration: '全体管理',
  settingsSectionComputers: 'コンピュータ',
  adminSectionProjects: 'プロジェクト',
  adminSectionUsers: 'ユーザー',
  adminSectionStorage: 'ストレージ',
  adminSectionLaunchers: 'ランチャー',
  adminSectionAudit: '監査ログ',
  adminAuditDescription:
    'すべてのProjectと、Projectに属さない記録（ログイン、ユーザーの管理、保存先、通知先など）を新しい順に表示します。',
  newLocalUser: 'ローカルユーザーを作成',
  userSearch: 'ユーザーを検索',
  adminUserSearchPlaceholder: '名前・ユーザー名・メールアドレス',
  userStatusFilter: '状態',
  userStatusAll: 'すべての状態',
  userStatusActive: '有効',
  userStatusDisabled: '無効',
  userAuthSources: '認証方式',
  userAuthLocal: 'ローカル',
  userAuthSso: 'SSO',
  userAuthNone: '開発用',
  userAuthServiceToken: 'API tokenのみ',
  userGlobalAdmin: '全体管理者',
  userIsAdmin: '管理者',
  userIsNotAdmin: '—',
  userAdminFromSso: 'Authentikのgroupが正本',
  userServiceAccount: 'Service Account',
  userLastLogin: '最終ログイン',
  userActions: '操作',
  userMakeAdmin: '管理者にする',
  userRemoveAdmin: '管理者を外す',
  userResetPassword: 'パスワード再設定',
  userDisable: '無効化',
  userEnable: '有効化',
  userMakeAdminTitle: '全体管理者にする',
  userRemoveAdminTitle: '全体管理者を外す',
  userResetPasswordTitle: 'パスワードを再設定',
  userDisableTitle: 'ユーザーを無効化',
  userEnableTitle: 'ユーザーを有効化',
  userNoMatches: '一致するユーザーはいません',
  userIsYou: 'あなた',
  userLastAdminLocked:
    '最後の全体管理者なので、無効化も管理者を外すこともできません。先にほかの人を全体管理者にしてください。',
  localLoginDisabledNotice:
    '今のAPI serverの設定（AUTH_MODE）では、ローカルアカウントでログインできません。作成はできますが、ログインできるのはAUTH_MODEをlocalかhybridにしたときです。',
  initialPassword: '初回パスワード',
  initialPasswordHint: 'UTF-8で12〜1024バイト。初回ログイン時に変更が必要です。',
  generatePassword: '生成',
  emailOptional: 'メールアドレス（任意）',
  makeGlobalAdmin: '全体管理者にする',
  usernamePatternHint: '小文字英数字と . _ -',
  initialPasswordTooShort: '初回パスワードは12 byte以上にしてください',
  temporaryPasswordTitle: '一時パスワード',
  temporaryPasswordOnce: 'この画面を閉じると再表示できません。本人へ安全な方法で伝えてください。',
  userMenu: 'ユーザーメニュー',
  account: 'アカウント',
  accountProfile: 'プロフィール',
  accountGroups: '所属group',
  accountGroupsSso: 'Authentikのgroupが正本です。',
  accountNoGroups: '所属groupはありません',
  accountPassword: 'パスワード',
  passwordChange: 'パスワードの変更',
  accountTokens: '自分のAPI token',
  accountTokenProject: 'プロジェクト',
  accountTokenAllProjects: 'すべて',
  accountTokenNoProjects: 'API tokenを発行するには、プロジェクトを作成するか参加してください。',
} as const, english.adminText);

export const adminTextTemplates = localized({
  userDisableConfirm: (name: string) =>
    `「${name}」を無効化します。ログイン中のsessionは直ちに終了し、API tokenも使えなくなります。`,
  userEnableConfirm: (name: string) =>
    `「${name}」を有効化します。API tokenは再び使えますが、終了したsessionは戻りません。`,
  userMakeAdminConfirm: (name: string) => `「${name}」を全体管理者にします。`,
  userRemoveAdminConfirm: (name: string) => `「${name}」の全体管理者権限を外します。`,
  userDisableSelfConfirm: (name: string) =>
    `あなた自身（${name}）を無効化します。すぐにログアウトされ、このアカウントではログインもAPI tokenも使えなくなります。元に戻すには、ほかの全体管理者に有効化を依頼する必要があります。`,
  userRemoveAdminSelfConfirm: (name: string) =>
    `あなた自身（${name}）の全体管理者権限を外します。すぐに全体管理の画面を使えなくなり、戻すにはほかの全体管理者に依頼する必要があります。`,
  userServiceAccountProject: (projectName: string) => `Service Account（${projectName}）`,
  userResetPasswordConfirm: (name: string) =>
    `「${name}」のパスワードを一時パスワードに置き換え、ログイン中のsessionを終了します。`,
  groupsSyncedAt: (date: string) => `最終同期 ${date}`,
}, english.adminTextTemplates);
