// The Plugins screen: what a plugin is for, whether the API server can reach it, and where its
// imports go. The older plugin labels (接続を確認, データセットを検索, ...) stay in catalog.ts.
export const pluginsText = {
  pluginsAbout:
    'Pluginは、このアプリとは別に動くサービスです。Mado pluginを登録すると、Madoのデータセットを検索してRunの入力に取り込み、Runの記録をMadoへ送れます。',
  pluginsEmptyForProjectAdmin:
    'このプロジェクトにはPluginが登録されていません。Pluginの登録は全体管理者が行います。MadoのデータセットをRunの入力に使いたいときは、全体管理者にMado pluginの登録を依頼してください。',
  pluginsEmptyForGlobalAdmin:
    'このプロジェクトにはPluginが登録されていません。［Pluginを登録］から登録します。登録はプロジェクトごとです。',
  pluginTokenStatus: 'API serverの設定',
  pluginTokenConfigured: '設定済み',
  pluginTokenMissing: '未設定（API serverに変数が無い）',
  pluginSearchNeedsCheck: '［接続を確認］が成功すると、データセットを検索できます。',
  pluginOpenDatasets: '取り込んだデータセットを見る（Datasets）',
  madoPluginPresetHint:
    '接続先は、Mado pluginが待ち受けるURL（同じマシンなら http://127.0.0.1:4190）です。環境変数名は、PluginのMMT_PLUGIN_TOKENと同じ値をAPI serverの.envに置いた変数の名前です。',
} as const;

export const pluginsTextTemplates = {
  pluginTokenMissingNotice: (name: string) =>
    `API serverに環境変数 ${name} がありません。PluginのMMT_PLUGIN_TOKENと同じ値を、API serverの.envに ${name} として設定し、API serverを再起動してから［接続を確認］を押してください。`,
};
