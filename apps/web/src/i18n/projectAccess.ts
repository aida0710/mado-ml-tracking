import * as english from './en/projectAccess';
import { localized } from './localized';
// Project members, Authentik group bindings and the user picker on the settings page.
export const projectAccessText = localized({
  addMember: 'メンバーを追加',
  editMember: 'メンバーを編集',
  removeMember: 'メンバーの直接付与を外す',
  remove: '外す',
  memberUser: 'ユーザー',
  effectiveRole: '実効Role',
  directRole: '直接付与のRole',
  memberSources: '付与元',
  memberSourceDirect: '直接付与',
  memberGrantedByGroup: 'Authentikのgroupで付与',
  memberDisabled: '無効',
  memberDisabledHint: 'このアカウントは無効化されているため、Roleがあってもログインやtokenでの操作はできません。',
  memberPublicRoleHint:
    'このプロジェクトはPublicなので、ログインできる人はViewerでもEditorとして編集できます。',
  memberPublicViewerHint:
    'このプロジェクトはPublicなので、Viewerを付けてもEditorとして編集できます。見るだけにしたいときは、プロジェクトの公開範囲をPrivateにしてください。',
  memberServiceAccount: 'Service Account',
  memberServiceAccountHint:
    'Service Accountです。RoleはService Accountsの欄で変更します。ここで外すとtokenを発行できなくなります。',
  memberServiceAccountManaged: 'Service Accountsの欄で変更',
  directRoleHint:
    'groupで付与されたRoleの方が高い場合は、そちらが実効Roleになります。groupの権限はAuthentik groupの欄で変更します。',
  userSearchPlaceholder: '名前・メールアドレス・ユーザー名の先頭で検索',
  userSearchNoResults: '一致するユーザーがいません',
  userSearchRequired: '追加するユーザーを選択してください',
  changeSelectedUser: '選び直す',
  lastProjectAdminConflict:
    'Project adminがいなくなるため変更できません。先に別のメンバーか、誰かがログインしたことのあるgroupへAdminを付与してください。',
  lastProjectAdminLocked:
    '最後のAdminなので変更・削除できません。先に別のメンバーか、誰かがログインしたことのあるgroupへAdminを付けてください。',
  groupWithoutMembers: 'まだ誰もログインしていません',
  groupWithoutMembersHint:
    'このgroupでログインした人がまだいません。group名が正しいか確かめてください。誰かがログインするまで、AdminでもAdminが残るかの判定に数えません。',
  groupBindings: 'Authentik group',
  groupBindingsDescription:
    'groupに入っている全員へRoleを付与します。groupの所属はSSOのログイン時にAuthentikから同期されます。',
  groupBindingsEmpty: 'groupへの付与はまだありません',
  addGroupBinding: 'groupを追加',
  editGroupBinding: 'groupのRoleを編集',
  removeGroupBinding: 'groupへの付与を外す',
  groupName: 'group名',
  groupNameHint: '候補はログインしたユーザーのgroupです。候補にないgroup名も入力できます。',
  grantedAt: '付与日時',
} as const, english.projectAccessText);

// Text that embeds values.
export const projectAccessTextTemplates = localized({
  memberSourceGroup: (group: string) => `group ${group}`,
  memberPublicRole: (role: string) => `${role}（Public）`,
  removeMemberConfirm: (removal: { displayName: string; keepsGroupRole: boolean; isSelf: boolean }) =>
    (removal.isSelf
      ? 'あなた自身への直接付与を外します。'
      : `「${removal.displayName}」への直接付与を外します。`) +
    (removal.keepsGroupRole
      ? 'groupで付与されたRoleは残ります。'
      : removal.isSelf
        ? 'あなたはこのProjectを使えなくなります。'
        : 'このユーザーはこのProjectを使えなくなります。'),
  memberAlreadyAdded: (role: string) => `既に${role}です。Roleは一覧の［変更］で変えます`,
  groupBindingExists: (group: string, role: string) =>
    `group「${group}」は${role}で登録済みです。Roleを変えるときは一覧の「変更」を使ってください。`,
  removeGroupBindingConfirm: (group: string) =>
    `group「${group}」への付与を外します。このgroupだけでRoleを得ていたユーザーは、このProjectを使えなくなります。`,
}, english.projectAccessTextTemplates);
