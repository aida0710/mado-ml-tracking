import * as english from './en/projects';
import { localized } from './localized';
// Projects themselves: the switcher, creation, visibility, archiving and the admin Project list.
export const projectsText = localized({
  projectSwitcherPlaceholder: 'プロジェクトを選択',
  projectSwitcherFilter: 'プロジェクトを絞り込み',
  projectSwitcherNotMember: '参加していない',
  projectSwitcherNotMemberHint:
    'メンバーではありません。Publicか、全体管理者なので開けます。',
  projectNameTakenHint:
    '同じ名前のプロジェクトがあります。切り替えのメニューで見分けにくくなるので、別の名前にすることをおすすめします。',
  projectDescriptionOptional: '説明（任意）',
  projectVisibility: '公開範囲',
  public: 'Public',
  private: 'Private',
  projectVisibilityPublicHint: 'ログインできる全員が、メンバーに追加しなくても見られて、Editorとして編集できます。',
  projectVisibilityPrivateHint: 'メンバーに追加した人だけが見られます。',
  projectInitialMembers: 'メンバー（任意）',
  projectInitialMembersHint:
    'あなたはAdminとして加わります。ほかに使う人をここで追加できます。あとからプロジェクト設定でも追加できます。',
  projectMembersPublicNote:
    'このプロジェクトはPublicです。ログインできる全員が、メンバーに追加しなくても見られて、Editorとして編集できます。下の一覧には、メンバーに追加した人とgroupで加わった人だけを表示します。Adminはメンバーにだけ付けられます。',
  projectMembersPrivateNote:
    'このプロジェクトはPrivateです。メンバーに追加した人とgroupで加わった人だけが見られます。',
  projectArchive: 'アーカイブ',
  projectArchiveTitle: 'プロジェクトをアーカイブ',
  projectArchiveDescription:
    'アーカイブすると、このプロジェクトは一覧から消え、誰も開けなくなります。Run・モデル・Artifactのデータは残り、全体管理者が全体管理の「プロジェクト」から元に戻せます。待機中・実行中のJobがあるときはアーカイブできません。',
  projectHasActiveJobs:
    '待機中または実行中のJobがあるため、アーカイブできません。Jobsの画面でJobが終わるのを待つか停止してから、もう一度アーカイブしてください。',
  projectNotArchived:
    'アーカイブしていないプロジェクトは完全に削除できません。先にアーカイブしてください。',
  adminProjectsDescription:
    'すべてのプロジェクトです。メンバー数は、メンバーに追加した人・groupで加わった人・Service Accountの数で、Publicで見られる人は数えません。',
  projectAdmins: 'Admin',
  projectAdminsNone: '（Adminの人がいません）',
  adminProjectsEmpty: 'プロジェクトはまだありません',
  projectIncludeArchived: 'アーカイブ済みも表示',
  projectMemberCount: 'メンバー数',
  projectRunCount: 'Run数',
  projectStateActive: '有効',
  projectStateArchived: 'アーカイブ済み',
  projectRestore: '元に戻す',
  projectRestoreTitle: 'プロジェクトを元に戻す',
  projectPurge: '完全に削除',
  projectPurgeTitle: 'プロジェクトを完全に削除',
  projectPurgeNameLabel: '確認のため、プロジェクト名を入力してください',
  projectStorageChangeHint:
    '保存先を変えても、既存のArtifactは今の保存先に残ります。これから保存する分だけが新しい保存先に入ります。',
  projectSettingsConfirmTitle: 'プロジェクト設定の変更を確認',
  projectSettingsConfirmSave: '変更を保存',
  projectBecomesPublic:
    '公開範囲をPublicにします。ログインできる全員がEditorとして見られて、編集できるようになります。ViewerにしていたメンバーもEditorとして使えるようになります。',
  projectBecomesPrivate: '公開範囲をPrivateにします。メンバーでない人は見られなくなります。',
  projectListMine: '参加しているプロジェクト',
  projectListRole: 'あなたの権限',
  projectListPublic: 'メンバーでなくても入れるプロジェクト（Public）',
  projectListPublicHint:
    'ログインできる全員がEditorとして使えるプロジェクトです。開いて作ったRunや実験は、そのプロジェクトに入ります。',
  projectListAdminHint: 'メンバーでないPrivateのプロジェクトは、全体管理の「プロジェクト」にあります。',
  projectListAdminLink: '全体管理のプロジェクト一覧',
  projectArchivedNotAccessible:
    'このプロジェクトはアーカイブされています。使うときは、全体管理者に全体管理の「プロジェクト」から元に戻すよう依頼してください。',
  projectSettingsContents: 'プロジェクト設定の目次',
} as const, english.projectsText);

// Text that embeds values.
export const projectsTextTemplates = localized({
  projectArchiveConfirm: (name: string) =>
    `「${name}」をアーカイブします。Run・モデル・Artifactのデータは残り、全体管理の「プロジェクト」から元に戻せます。`,
  projectArchiveStops: (usableTokenCount: number | undefined) =>
    usableTokenCount === undefined
      ? '止まるもの: このプロジェクトに限定したAPI token（workerとService Accountのものを含む）は使えなくなり、動いているworkerはJobを受け取れなくなります。Sweep・フック・自動実行・自動の昇格も止まります。'
      : `止まるもの: このプロジェクトに限定したAPI token ${usableTokenCount}本（workerとService Accountのものを含む）が使えなくなり、動いているworkerはJobを受け取れなくなります。Sweep・フック・自動実行・自動の昇格も止まります。`,
  projectSwitcherCreatedAt: (date: string) => `${date} 作成`,
  projectPurgeIdentity: (dates: { createdAt: string; archivedAt: string }) =>
    `作成 ${dates.createdAt}・アーカイブ ${dates.archivedAt}`,
  projectArchived: (name: string) =>
    `「${name}」をアーカイブしました。全体管理者が全体管理の「プロジェクト」から元に戻せます。`,
  projectRestoreConfirm: (name: string) =>
    `「${name}」を元に戻します。メンバーとデータはアーカイブする前のまま使えます。`,
  projectPurgeConfirm: (name: string) =>
    `「${name}」を完全に削除します。Run・モデル・データセット・Artifact（保存先のファイルを含む）・メンバーの設定をすべて消し、元に戻せません。保存先のファイルは、削除待ちの猶予（API serverのMMT_ARTIFACT_DELETE_GRACE_DAYS、既定7日）が過ぎてから消えます。監査ログは残ります。`,
  projectMemberRole: (displayName: string) => `${displayName}のRole`,
  projectMemberRemove: (displayName: string) => `${displayName}を外す`,
  projectArchivedAt: (date: string) => `アーカイブ ${date}`,
  projectSettingsAdminOnly: (adminNames: string) =>
    adminNames
      ? `変更できるのはこのプロジェクトのAdmin（${adminNames}）です。変更が必要なときはAdminに依頼してください。`
      : '変更できるのはこのプロジェクトのAdminです。変更が必要なときはAdminに依頼してください。',
  projectStorageChange: (from: string, to: string) =>
    `Artifactの保存先を「${from}」から「${to}」に変えます。既存のArtifactは「${from}」に残り、これから保存する分だけが「${to}」に入ります。`,
}, english.projectsTextTemplates);
