// Projects themselves: the switcher, creation, visibility, archiving and the admin Project list.
export const projectsText = {
  projectSwitcherPlaceholder: 'プロジェクトを選択',
  projectSwitcherFilter: 'プロジェクトを絞り込み',
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
    'すべてのプロジェクトです。メンバー数は、メンバーに追加した人とgroupで加わった人の数で、Publicで見られる人は数えません。',
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
} as const;

// Text that embeds values.
export const projectsTextTemplates = {
  projectArchiveConfirm: (name: string) =>
    `「${name}」をアーカイブします。Run・モデル・Artifactのデータは残り、全体管理の「プロジェクト」から元に戻せます。`,
  projectRestoreConfirm: (name: string) =>
    `「${name}」を元に戻します。メンバーとデータはアーカイブする前のまま使えます。`,
  projectPurgeConfirm: (name: string) =>
    `「${name}」を完全に削除します。Run・モデル・データセット・Artifact（保存先のファイルを含む）・メンバーの設定をすべて消し、元に戻せません。`,
  projectMemberRole: (displayName: string) => `${displayName}のRole`,
  projectMemberRemove: (displayName: string) => `${displayName}を外す`,
  projectArchivedAt: (date: string) => `アーカイブ ${date}`,
  projectStorageChange: (from: string, to: string) =>
    `Artifactの保存先を「${from}」から「${to}」に変えます。既存のArtifactは「${from}」に残り、これから保存する分だけが「${to}」に入ります。`,
};
