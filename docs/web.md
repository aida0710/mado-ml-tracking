# Webの実装規約

`apps/web`の画面を変更するときの置き場所と層の分け方です。画面の文言は`apps/web/src/i18n/`に集め、画面（`pages/`、`components/`、`layout/`）、状態管理のhook（`hooks/`）、APIクライアント（`api/`）、純粋なロジック（`lib/`）を分けます。

## 表示言語

既存のブラウザテストは日本語の操作を確認するため、ブラウザの`locale`を`ja-JP`に指定します。`tests/browser-i18n.mjs`は英語で起動し、言語の切り替えと入力内容の維持を確認します。

日本語の辞書は`i18n/*.ts`、英語の辞書は同名の`i18n/en/*.ts`です。`localized`で各辞書を結び、`catalog.ts`は`mergeTranslations`でまとめます。辞書を通常のオブジェクト展開でまとめると、読み込み時の言語で固定されるため使いません。別の辞書を参照するラベルもgetterで読みます。

文言や日付を描画するコンポーネントは`useLocale()`で変更を購読します。翻訳を含む`useMemo`は`useLocalizedMemo`にします。値だけの計算やAPI取得は言語に依存させません。日付・数値には`getIntlLocale()`の書き方を使います（大きな数は日本語で「120万」、英語で“1.2M”）。`Intl`の部品は作るのが重く、ログの1行ごとに呼ばれるものもあるので、`i18n/intlFormatterCache.ts`の`memoizePerIntlLocale`で言語ごとに1つ作って使い回します。名前の列挙・ラベルの並び・文のつなぎ・括弧の注記は`i18n/textJoining.ts`、英語の辞書で名前を引用して並べるときは`i18n/formatEnglishQuotedList.ts`を使います。利用者が入力した名前・説明・ログの内容は翻訳しません。

通知は、件数・バージョン・結果などを保持して描画時に翻訳します。エラーは元の`RequestError`や`LocalizedError`を保持し、`formatErrorMessage`を描画時に呼びます。翻訳した文字列を状態に保存すると、後から言語を変えても元の表示が残ります。英語の件数には`formatEnglishCount`を使い、1件のときの名詞・動詞・代名詞も合わせます。

`i18n/locale.ts`が`mmt.locale`に選択を保存します。辞書と初期言語は`i18n/*.test.ts`、切り替え中の入力保持・別タブ同期・モバイル表示は`tests/browser-i18n.mjs`で確認します。

## スタイルシート

フォント、色・影・角丸・書体の変数、要素の既定、共通の部品（ボタン、入力欄、ダイアログ、タブ、表、状態バッジ、ページの見出し）、画面の枠（上部バー、サイドバー、ドロワー、ログイン画面）はMadoと共有するデザインシステム（`@mado/design-system`、[aida0710/mado-design-systems](https://github.com/aida0710/mado-design-systems)）にあり、`apps/web/src/main.tsx`が日本語のNoto Sans JPとあわせて最初に読み込みます。ファイルの分け方と決まり、バージョンの上げ方は[リポジトリのREADME](https://github.com/aida0710/mado-design-systems#readme)にあります。依存はGitHub Releaseのtarball（`apps/web/package.json`）で、バージョンを上げるときはそのURLを替えて`npm install`します。Madoも同じclass名を使うので、両方の見た目を変えるときはそのリポジトリを直してバージョンを上げ、このアプリだけの見た目は下の領域のファイルで上書きします。

ログインヘッダーの変更は[共有デザインのPR #1](https://github.com/aida0710/mado-design-systems/pull/1)でレビュー中です。現在は0.5.2のコミット`4e7259949cb9f8d1baa63799f154d05b06a17449`のHTTPS tarballを両アプリで固定しています。Gitを含まないWebビルド用コンテナでもインストールできます。Release公開後は同じ版のRelease tarballへ変更します。`LoginHeader`はロゴと`LanguagePicker`を共有の`.login-header`で並べ、ログインと初回パスワード変更の両画面から使います。

そのあと、`apps/web/src/styles/`に置いた領域別のファイルを次の順に読み込みます。

| ファイル | 対象 |
|---|---|
| breakpoints | 画面幅の切り替え点（`--bp-sm`・`--bp-md`・`--bp-lg`） |
| base | このアプリの高さと幅（プロジェクトバー、Experimentsの実験一覧）、描画に失敗したときの画面 |
| layout | Projectの切り替え（サイドバーの一番上とプロジェクトバーのボタン、そのドロップダウン）、公開範囲（ProjectとコンピュータのPublic・Private）の鍵の印（`.visibility-label`）、作業領域の高さ |
| tables | Experimentsの実験一覧、Runのツールバー・選択バー、Runの表 |
| registry | Registryの一覧・詳細、詳細リスト、自動実行パネル、グラフ、ログ、Job、Lineage |
| artifacts | Artifactの一覧・プレビュー・アップロード結果 |
| forms | このアプリだけのダイアログの幅、ダイアログの下のボタンの固定、ダイアログの中の詳細リスト、1行ずつの選択肢（`choice-picker`。保存先と公開範囲）、候補つきの入力欄 |
| workbench | コード編集、ファイルツリー、Task、実行スナップショット |
| admin | 設定のセクション（最下部のアーカイブを含む）、plugin検索、容量メトリクス、全体管理の保存先とプロジェクト一覧、ユーザーメニュー |
| uploads | Artifactのアップロードダイアログ、ドロップ領域、進み具合、途中のアップロード |
| siteComputers | 全体設定 → コンピュータのsiteの詳細（job shellのバージョン、鍵と接続確認、自分の設定、利用者の設定、手動投入の案内）とjob shellの編集欄 |
| tabs | タブの並び（`components/Tabs.tsx`）が入りきらず横にずれるときの、隠れている側の端の薄まり |
| tapTargets | スマホ（`--bp-sm`未満）で、表の中とページの見出しの上のリンクの押せる範囲と、class の無い summary の高さ。最後に読み込む |

- 新しいCSSは、そのclassが属する領域のファイルへ足します。`styles.css`のような何でも入るファイルを作り直しません。
- 色・影・角丸は`@mado/design-system`の変数で書き、領域のファイルに色の値を直接書きません。合う変数が無いときは、役割の名前でデザインシステムに足し、ライトとダークの両方の値を決めます。リンクなど文字に使う青緑は`--link`、選択中の印や枠は`--accent`です。
- 画面幅による上書き（`@media`）は、対象の領域ファイルの末尾にまとめます。切り替え点は下の「画面幅への対応」の4つだけを使います。
- 詳細度が同じルールは読み込み順で勝ち負けが決まります。新しい領域ファイルを作るときは`main.tsx`の末尾に足し、既存の順番を入れ替えません。

## エラー文言の層

- `api/*.ts`（APIクライアント）は`i18n`を読み込みません。失敗は`RequestError`（status、code、サーバーのerror文字列`serverMessage`）で返します。`api/i18nIndependence.test.ts`がAPIクライアントのi18n importを検出します。
- 画面に出す文言への変換は`lib/errorMessage.ts`の`formatErrorMessage`が行い、`useMutation`と`useQuery`が描画時にこれを使います。APIのエラー文（`serverMessage`）は日本語で、操作を具体的に書きます（例:「削除済みのRunは編集できません」）。codeは次の3つに分けて扱います。
  - Webが文言を持つcode: どちらの言語でもWebの文言を現在の言語で出します。
    - `network_error`: APIへ接続できなかった
    - `invalid_response`: 応答の形が契約と違う（`invalidResponseError()`で投げる）
    - `artifact_too_large`: uploadの413。前段proxyがHTMLで拒否した場合も同じ文言にする
    - `artifact_content_unavailable`: Artifactの中身を取得できなかった（raw bytesの取得でAPIのエラー本文が無い）
    - `sweep_space_invalid`: `lib/sweepSpaceError.ts`がAPIの既知の全文だけを照合して翻訳します。parameter名・値は原文のまま埋め込み、未知の制約はサーバーの説明を保ちます。API側の探索空間エラーを変えるときは照合と日英辞書も確認します。
  - 英語の画面でだけ置き換えるAPIのcode: 日本語の画面ではサーバーの文をそのまま出し、英語の画面では`i18n/errors.ts`の英語の文を出します。サーバーの文が無いときは、日本語の画面でも`i18n/errors.ts`の日本語の文を出します。
    - `internal_error`・`database_unavailable`・`plugin_request_failed`・`plugin_disabled`: リクエスト、データベース、Pluginの共通の失敗
    - `upload_not_open`・`upload_expired`・`artifact_save_failed`・`part_checksum_mismatch`・`run_deleted`・`body_too_large`: アップロード、Run、サイズ制限の失敗。英語の文はcodeから決まる一般的な言い方なので、`run_deleted`（Artifactの登録・Runの説明の編集などで使う）のように複数の操作で使うcodeでは、特定の操作だけを指す文言にしません。
  - そのほかのcode: どちらの言語でもサーバーの文をそのまま出します。

## 権限判定

画面の権限判定は`lib/permissions.ts`（`isGlobalAdmin`、`canEditProject`、`canManageProject`、Sweepの`canControlSweep`とJobの停止・再実行の`canControlJob`（作った人かProject admin）、`canManagePlugins`、`canManageAutomationRules`、`canManageHooks`、`canTransferHookOwners`、`canCreateProject`、`canChangeOwnPassword`、コンピュータの`canAddTarget`・`canAddSshOrLocalTarget`・`isTargetOwner`・`canManageTarget`）に集めます。役割名との比較（`role === 'admin'`など）をcomponentに直接書きません。最後のAdminの判定（`lib/projectAdminGrants.ts`）と保護aliasの解除の判定（`lib/promotionEvidence.ts`の`canRemoveAlias`）も、APIの規則に合わせた表示の出し分けです。判定はAPIの検査（`accessService`）に合わせた表示の出し分けで、許可の正本はAPIです。

## 画面の枠

- `layout/TopBar.tsx`: 上部バー（アプリ名、テーマ、ユーザー表示、ログアウト）。画面の切り替えは置きません。`--bp-xs`未満ではボタンと並べるとアプリ名が入りきらないので、印だけを見せ、名前は読み上げとリンクの名前に残します（`ProductLogo`の`isNameVisuallyHidden`）。それより広い幅でも、入りきらなければ名前を「…」で縮め、画面の外へはみ出させません（`styles/productLogo.css`）。ユーザー表示のメニュー（`components/UserMenu.tsx`。項目は`layout/userMenuLinks.ts`）は、「アカウント」、ローカルアカウントの利用者だけ「パスワードの変更」（`/settings/account/password`）、全員に「全体設定」（`/settings/account`）です。テーマ（`hooks/useTheme.ts`）は、利用者が切り替えるまでOSの設定（`prefers-color-scheme`）に合わせ、切り替えたらブラウザの`localStorage`（`mmt.theme`）に保存します。`main.tsx`がログイン画面を含む最初の描画の前に`<html data-theme>`へ書きます。
- 画面の切り替え: 切り替え先と組（記録・モデル・データ・実行・プロジェクト管理、その下に全員の全体設定、全体管理者にはさらに全体管理）は`layout/navigationLinks.ts`の`navigationGroups`が、各画面のアイコン（lucide-react）は`layout/navigationIcons.ts`が決めます。広い幅では左のサイドバー（`layout/NavigationSidebar.tsx`）に、狭い幅では`layout/NavigationDrawer.tsx`に、組の見出しを付けて並べます。サイドバーは、名前とアイコンを並べる`sidebar`と、アイコンだけの細い列の`rail`の2つの形を持ちます。どの形にするか、畳んだかどうか、幅は`hooks/useNavigation.ts`が決めて覚えます。幅を変える境目は`layout/NavigationResizeHandle.tsx`、幅の範囲は`lib/navigationWidth.ts`です。
- `layout/AppShell.tsx`: Projectの画面の枠。`layout/ProjectBar.tsx`はProjectの切り替え（`layout/ProjectSwitcher.tsx`）と自分の権限を置き、広い幅ではサイドバーの一番上、狭い幅では上部バーの下の1行（プロジェクトバー）に出します。参加しているProjectが無いときは出しません。切り替えはブラウザのselectではなく自前のドロップダウン（listbox）で、各行に名前・公開範囲（Privateは鍵）・自分の権限を出し、開くと今のProjectを選んだ状態から↑↓・Home・End・Enter・Escで操作できます。Projectが8件以上（`lib/projectFilter.ts`の`PROJECT_FILTER_THRESHOLD`）になると絞り込みの入力を出します。一番下の「プロジェクトを作成」は作成できる人だけに出し、`dialogs/ProjectCreateDialog.tsx`を開きます。ドロップダウンはPopover API（`popover="manual"`）で最上位の層に出し、`hooks/useAnchoredPopover.ts`と`lib/dropdownPlacement.ts`が画面の内側に収めます。"/"で開くProjectは`lib/lastOpenedProject.ts`が決め、このブラウザで最後に開いたもの、次に自分がメンバー（直接付与・group。`Project.isMember`）のもので、他人のPublicや全体管理者として見えるだけのProjectには自分から開くまで入りません。どちらも無いとき・URLのProjectを開けないときは、プロジェクトの一覧（`pages/ProjectListPage.tsx`。参加しているもの、メンバーでなくても入れるPublic、［プロジェクトを作成］）を出します。作成できない人には管理者への依頼を表示します。
- プロジェクトの作成（`dialogs/ProjectCreateDialog.tsx`）: 切り替え・全体管理のプロジェクト一覧・Projectが無いときの画面で共通の1つのダイアログです。公開範囲の既定はPublicで、Privateを選んだときだけ「メンバー（任意）」を出します。見られるProjectに同じ名前があれば名前の欄の下で警告します（作成は止めない。`lib/projectNameCollisions.ts`）。作成後は呼び出し側がそのProjectを開きます。プロジェクト設定（`pages/SettingsPage.tsx`）はそのProjectの設定だけを置き、Projectの一覧と作成はありません。先頭に節の目次（`components/ProjectSettingsContents.tsx`。節とidは`lib/projectSettingsSections.ts`、各節はSettingsPageがidのある要素で包む）を置きます。最下部のアーカイブ（`components/ProjectArchiveSection.tsx`）はProject adminだけに出します。アーカイブの確認（`dialogs/ProjectArchiveDialog.tsx`。全体管理の一覧と共通）は、止まるもの（使えるProjectのtokenの本数、Sweep・フック・自動実行・自動の昇格）を書きます。設定からアーカイブすると"/"へ`state.archivedProjectName`つきで移り、AppShellはほかのProjectを自動で開かずにプロジェクトの一覧に完了を出します（`lib/archivedProjectState.ts`）。開けないProjectのURLでは`GET /projects/:p`で理由を問い、アーカイブ済みならそう出します（`hooks/useUnreachableProjectReason.ts`）。
- SDK・MLflowの接続の案内（`components/RecordingConnectionGuide.tsx`）: プロジェクト設定と、Experimentsの見出しの［SDKで記録］で開く同じ部品です。プロジェクトID（Experimentsでは選んだ実験のIDも）を［コピー］つきで出し、［Python SDK（mado-tracking）］と［MLflow 3］のタブに、そのIDと画面のURLを入れた例を出します（`lib/sdkConnectionSnippets.ts`、`lib/tokenUsageSnippet.ts`。tokenは`read -s`で端末から受け取り、例に書かない）。実験を選んでいないSDKの例は`experiment_name`で実験を名前で指定します。tokenの発行ボタン（`components/ProjectTokenButton.tsx`）はeditor以上に出します。値とコピーの組は`components/CopyableValue.tsx`、コピーできるコードは`components/CodeSnippet.tsx`です。
- API tokenの発行（`dialogs/TokenDialog.tsx`）: 発行のボタン（「自分のAPI token」、アカウント、「SDK・MLflow 3から接続」、Jobsの投入用、Service Account）はどれもこのダイアログを開きます。用途（`lib/tokenPurposes.ts`、`components/TokenPurposeFields.tsx`）を選ぶとscopeが決まり、scopeはチェックボックスで確かめて変えられます。用途は所有者のRoleで持てるscopeのものだけを出し、workerはService Accountだけです。既定は記録の用途（AdminのService Accountはworker）で、案内のボタンは`initialScopes`で用途を選んだ状態にします。発行後（`dialogs/IssuedTokenDialog.tsx`）はtokenの値と［tokenをコピー］、tokenを含まない設定例（`components/TokenUsageSnippet.tsx`。tokenは`read -s`で受け取る）と［設定例をコピー］を出します。
- Experimentsの最初の一歩（`pages/ExperimentsPage.tsx`）: 記録されたRunが無い実験（実験を選んでいなければProject全体。`lib/experimentList.ts`の`recordedRunCount`）では接続の案内を最初から開き、一覧の空の文（`lib/runListEmptyMessage.ts`）で次にやることを出します。実験が無いProjectでは見出しの主ボタンを［最初の実験を作成］にし、［Runを作成］（画面からJob用のRunを作る。`dialogs/RunDialog.tsx`の冒頭に説明）は出しません。実験の作成（`dialogs/ExperimentDialog.tsx`）は、同じ名前の実験があるとその場で知らせ、その実験を開けます。
- Runの検索欄（`components/runs/RunToolbar.tsx`）: 送る前に文法と値の種類（`lib/runFilter.ts`、`lib/runFilterValueKinds.ts`）を確かめ、直した式を示します。APIが断った式は`hooks/useRunSearch.ts`が`filterRejection`として返し、再試行のボタンなしで検索欄の下に出します。`metrics.`を付け忘れた比較は名前で探したうえで、直した式と［この式で検索］を出します（`lib/runFilterSuggestion.ts`）。
- `layout/SettingsShell.tsx`: 全体設定（Projectに属さない画面）の枠で、誰でも開けます。項目は`/settings/<項目>`（`layout/settingsSections.ts`。`/settings`は`/settings/account`へ移る）で、サイドバーの組で切り替えます。「全体設定」の組（アカウント、コンピュータ）は全員に、「全体管理」の組（プロジェクト、ユーザー、ストレージ、ランチャー、監査ログ）は全体管理者だけに出し、プロジェクトの画面のサイドバーにも同じ組を出します。全体管理の項目を全体管理者以外が開くと（知らない項目名も）`/settings/account`へ移します（`pages/AdminPage.tsx`）。全体管理の項目から移したときは`state`を付け、アカウントの上に「全体管理者だけが使えます」と出します（`layout/AdminOnlyRedirectNotice.tsx`）。各画面の上には、全体設定を開く前のProjectの画面へ戻るリンクを出します（`layout/SettingsReturnLink.tsx`。AppShellがProjectの画面のpathとProject名をタブごとの`sessionStorage`に覚える。`lib/settingsReturnScreen.ts`、`hooks/useRememberSettingsReturnScreen.ts`）。パスワードの変更（`pages/PasswordChangePage.tsx`）はアカウントの下の`/settings/account/password`で、ローカルアカウント以外は`/settings/account`へ移します。初回の必須の変更は別の`pages/RequiredPasswordChangePage.tsx`で、`AuthGate`がほかの画面の代わりに出します。各画面は`components/SettingsPageHeader.tsx`で、項目名の見出しの上に小さく属する組（「全体設定」か「全体管理」）を出します。全体設定より前のURL（`/account`、`/account/password`、`/admin`、`/admin/<項目>`）は`layout/legacySettingsPaths.ts`の対応で新しいURLへ置き換えで移します（`/admin`と知らない`/admin/<項目>`は以前と同じくプロジェクトの一覧`/settings/projects`へ）。

## コンピュータ

- 全体設定 → コンピュータ（`pages/ComputersSettingsPage.tsx`、`/settings/computers`）は誰でも開けます。一覧（`components/ComputerOverviewTable.tsx`）は`GET /targets/overview`の全コンピュータで、名前・種類・所有者（所有者のいないものは「全体」）・公開範囲（Privateは鍵）・状態（有効・無効、自動投入のsiteはランチャーの様子）・自分が使えるかを出します。使えるか管理できる行（`lib/computeTargetOverview.ts`の`canOpenTargetDetails`）だけが名前から詳細（`components/ComputerDetails.tsx`。siteは`SiteComputerDetails`、ssh・localはコンピュータIDの［コピー］つきの概要、管理する人には接続確認とそのIDを入れたworkerの設定例（`components/WorkerSetupGuide.tsx`、`lib/workerSetupSnippets.ts`）、管理しない人には概要の「workerの設定」の行に誰が設定するか）を開きます。手動投入のsiteの案内（詳細・Jobs・［ジョブを起動］の確認の段）には、`mado-tracking`の入れ方・このページのURLの`MMT_API_URL`・tokenを発行する場所を折りたたんで添えます（`components/SubmitCliSetup.tsx`、`lib/submitCliSetup.ts`）。詳細と編集の値は`GET /targets`（使える・管理するものだけ）から取り、2つの読み込みは`hooks/useComputers.ts`がまとめます。編集・有効の切り替え・接続確認は所有者と全体管理者だけです。
- 追加・編集のダイアログ（`dialogs/TargetDialog.tsx`）は誰でも使え、足した人が所有者になります。研究者はsiteだけを`components/TargetFields.tsx`の1枚の欄で足します。全体管理者の追加（`dialogs/NewComputerDialog.tsx`）は種類（SSH・Local・Site）を選び、siteは同じ1枚の欄、ssh・localは2段です。1段目「接続」（`components/ComputerConnectionFields.tsx`）で名前・公開範囲・SSHの接続先と、SSH鍵・known_hostsのパス（選んだworkerが報告したworkerのホスト上の候補から補完）と接続確認に使うworker（`components/CheckWorkerPicker.tsx`、`GET /targets/check-workers`）を入れ、［接続を確認して次へ］で無効のまま登録してそのworkerに確認を頼みます。確認がSSHで届けば2段目「接続後の設定」（`components/ComputerSetupFields.tsx`）を確認の結果で埋め（`lib/computerSetupValues.ts`: CPU、動いたRuntime、見つかったGPUの全部、3.11以上のPython、GPUの数の同時実行数）、［保存］で設定を保存して有効にします。確認に失敗したときやworkerが無いときは、［確認せずに次へ］で手で入力します。段の進み方は`hooks/useNewComputerSteps.ts`、確認の読み込みは`hooks/useTargetCheck.ts`です。ssh・localの編集（`dialogs/ComputerEditDialog.tsx`）は同じ2つの欄をタブで切り替え、［再確認］は変えた接続を先に保存してから確かめ直し、候補を新しくします。作業ディレクトリとPythonの欄は確認の候補を入力で絞り込み、/ で終わる入力ではworkerにそのディレクトリを読ませて補います（`hooks/useTargetDirectoryListings.ts`がパスごとに覚え、`lib/targetPathSuggestions.ts`・`lib/targetPathCompletion.ts`が候補を作る）。GPUは見つかったものをチェックで選び、ログインノード経由のように確認したマシンとJobが動くマシンが違うときのため、1行に1件の手入力の欄も残します。選択肢はブラウザのselectではなく`components/OptionPicker.tsx`（ラジオの行）と`components/CheckboxList.tsx`です。公開範囲（`components/VisibilityPicker.tsx`、`OptionPicker`の上に作る）の既定はPrivateで、所有者のいないコンピュータは選ばせません（APIがPrivateを拒むため）。
- プロジェクトの「Compute」（`pages/ComputePage.tsx`）は、このプロジェクトで自分が使えるコンピュータ（`GET /targets?projectId=`）の読み取りだけの一覧（`components/ComputeTargetsTable.tsx`）と、全体設定 → コンピュータへのリンク、workerの状態です。一覧の「worker」の列は、そのコンピュータのJobを受け取るこのプロジェクトのworker（`lib/workerCoverage.ts`の`jobWorkerCoverage`。`MMT_WORKER_TARGET_IDS`に含むか、何も指定しないworker）がオンラインか、オフライン（最終応答）か、いないかです。siteはworkerを使いません。
- workerがいない・応答しないことは、Jobを待たせる前と待っている間に言います（`components/WorkerCoverage.tsx`、`i18n/workerCoverage.ts`）。［ジョブを起動］の実行先の選択肢と段（`dialogs/LaunchDialog.tsx`）、Jobsの一覧の上の「始まらない待機中のJob」と待機中のJobの詳細（`components/QueuedJobWaitNotice.tsx`、`lib/queuedJobWait.ts`。workerがいれば同時実行数かGPUの空き待ちと出す）、Sweepの詳細（`components/sweeps/SweepWorkerNotice.tsx`。待機中の試行があるときだけworkerを読む）。全体設定 → コンピュータの詳細では、全体管理者に全プロジェクトのworker（`GET /workers`、`hooks/useAllWorkers.ts`）から「Jobを受け取るworker」を出し、接続確認を頼む前に、コンピュータを名指ししたworkerが応答していなければそう言います（`TargetCheckPanel`。名指ししないworkerは確認を受け取らない）。案内のリンクは`layout/settingsSections.ts`の`computerDetailsPath`（`/settings/computers?computer=<id>`。開いている詳細はURLの`computer`）です。
- Jobs（`pages/JobsPage.tsx`）: Jobを選ぶと（`?job=`で開いたときも）一覧の下の詳細へ一度だけ画面を移し、見出しへフォーカスを置きます（ポーリングでは動かさない）。［詳細を閉じる］で`job`を外します。詳細はJobの項目、手動投入の案内、ログ、実行snapshotの順です。起動元の列には、Sweepの試行（`JobListItem.sweepTrial`。Sweepの画面へのリンク）と自動実行のrule（`automationRule`）も出します。［最新checkpointから再開］は`hasResumeCheckpoint`のJobだけに出し、試行の列は人が上限を超えて再実行したJobを「2（自動の再試行は1回目まで）」と出します（`lib/jobDisplay.ts`の`jobAttemptLabel`）。
- ログ（`components/RunLogs.tsx`、`hooks/useRunLogs.ts`、`lib/runLogText.ts`。JobsとRunのLogsタブで共通）: 最新の2,000行（`RUN_LOG_TAIL_LINES`、`GET .../logs?tail=`）をポーリングし、全体の行数（`totalCount`）が多ければ［すべての行を読み込む］を出します。開いたときは最新の行の位置で、そこにいる間は新しい行を追い、離れたら止まり、［最新へ］で戻ります。レベル・並び順（古い順・新しい順）・検索（大文字小文字を区別しない）は読み込んだ行が対象です。［ダウンロード］は`tail`なしで全行を取り、記録したままの本文を「時刻・レベル・本文」のタブ区切りで`<Run名>.log`に保存します。表示は時刻を秒まで（`lib/format.ts`の`formatDateTimeSeconds`）、`\r`で上書きした行は最後の内容だけです。枠は`tabIndex=0`でキーボードでもスクロールできます。
- ［ジョブを起動］（`dialogs/LaunchDialog.tsx`、`hooks/useLaunch.ts`）: 新しいRunは`POST /jobs/launch`でJobと一緒に作り、Jobを断られたらRunも残りません（既存のqueuedのRunにだけ`POST /jobs`）。種別・モデルバージョン・コード・実行先の変更で合わなくなった選択だけを外し、外したものを画面に出します（`lib/launchFormChanges.ts`）。コードの欄には、種別に合わず出していないコードの数を添えます。入力データセットとGPUはチェックボックス（GPUの無いコンピュータはその旨）です。Runの画面の［ジョブを起動］は、Jobがまだ無いqueuedのRunだけに出し（`hooks/useRunJob.ts`）、Jobがあれば［Jobを見る］を出します。

## 画面幅への対応

切り替え点は`styles/breakpoints.css`の`--bp-xs`（390px）・`--bp-sm`（640px）・`--bp-md`（900px）・`--bp-lg`（1200px）です。`--bp-xs`はこのアプリだけのもので、上部バーのアプリ名を隠す幅です（デザインシステムは残りの3つを使います）。CSSの変数は`@media`の中に書けないので、メディアクエリは同じ値を範囲の書き方で`@media (width < 640px)`・`(width < 900px)`・`(width < 1200px)`と書きます。スクリプトで幅を見るときは`lib/breakpoints.ts`の`narrowerThan('md')`を`lib/useMediaQuery.ts`に渡します。`lib/breakpoints.test.ts`が、CSSの変数とTSの値の一致と、ほかの数値のメディアクエリが無いことを確かめます。幅の広いタッチ画面も対象にするときだけ、`(width < 1200px), (pointer: coarse)`のように`(pointer: coarse)`を併記できます。

- 画面の切り替え: `--bp-lg`以上では左のサイドバーに名前とアイコンを並べます。サイドバーの下のボタンでアイコンだけの列（幅`--navigation-rail-width`、名前はツールチップと読み上げで伝えます）に畳め、右の境目をドラッグするか、境目にフォーカスして左右の矢印キーで幅（`--navigation-width`）を160〜360pxの間で変えられます。ダブルクリックかEnterで既定の192pxに戻ります。畳んだかどうかと幅は、ブラウザの`localStorage`（`mmt.navigation.collapsed`・`mmt.navigation.width`）に保存します。`--bp-md`以上`--bp-lg`未満では、サイドバーとExperimentsの実験一覧が並ぶとRunの表の幅が足りないので、いつもアイコンだけの列にします。`--bp-md`未満では上部バーのメニューボタンから左に出るドロワー（`layout/NavigationDrawer.tsx`）へ移します。メニューボタンは`aria-expanded`で開閉を示し、Esc、ドロワーの外側のタップ、リンクの選択で閉じます。
- プロジェクトバー: サイドバーを名前つきで広げていないとき（アイコンだけの列とドロワー）に出し、どの幅でも1行です。狭い幅ではProjectの切り替えのボタンが縮み、名前を省略します。サイドバーはライト・ダークのどちらでも上部バーと同じ暗い地なので、サイドバーの中の切り替えのボタン・ラベル・権限は`--header-*`の色を使い、ドロップダウンは画面と同じ面の色にします。画面の上に並ぶものの高さは`--chrome-height`（上部バーと、出ていればプロジェクトバー）です。
- タップ領域: `--bp-md`未満では、ボタン・アイコンボタン・入力欄・選択欄の高さを`--tap-target`（40px）以上にします（パッケージの`base.css`と`components.css`）。リンクボタン・summary・チェックボックスのラベル・スライダーも広げる画面は、根元の要素に`touch-targets`のclassを付けます（`components.css`）。スマホでは、表の中とページの見出しの上（パンくず）のリンクは文字の位置を変えずに押せる範囲だけを広げ（インラインの余白と、横は同じ幅の負のマージン）、classの無いsummary（実行snapshotの［Source］など）は`--tap-target`の高さにします（`styles/tapTargets.css`）。
- 表: 狭い幅で列を減らす一覧は`components/ResponsiveTable.tsx`を使います。列ごとに`priority: 'primary' | 'secondary'`を指定し、`--bp-md`未満では`primary`の列だけを行に残して、行の右端のボタンで`secondary`の列を行の下に開きます。`selectedKey`で選択中の行に印を付け、`empty`で行が無いときの表示を渡します。テストでは幅を引数で受ける`ResponsiveTableView`を描画します。`onRowClick`はポインタ用の近道なので、キーボードで開けるリンクかボタンを`primary`の列に置きます。チェックでまとめて選ぶ表は`isSelected`で選んだ行すべてに印を付けます。`components/DataTable.tsx`は表の中だけで横にスクロールします。
- Runの一覧: `components/runs/RunTable.tsx`も同じ考え方で、スマホ（`--bp-sm`未満）では選択・Run名・状態だけを行に残し、保存ビューで選んだ残りの列は行を開いて見ます（`NarrowRunTable.tsx`が`ResponsiveTableView`で描く）。ほかの一覧と違って`--bp-md`ではなく`--bp-sm`で切り替えるのは、タブレットの幅ならMetricsを横に並べて比べられるほうが役に立つからです。それより広い幅（`WideRunTable.tsx`）は全部の列を並べ、見出しのドラッグ（Alt+←→）で列を動かし、境目のドラッグ（←→）で幅を変えます。2つが共有するセルは`RunTableCells.tsx`、選択の計算は`lib/runSelection.ts`です。
- タブ: `components/Tabs.tsx`は、入りきらないと横にずれます。選んだタブ（URLで開いたもの、半分切れていて押したもの、矢印キーで選んだもの）は端から少し離して見える位置へ動かし（`hooks/useRevealSelectedTab.ts`）、隠れているタブがある側の端を薄くして続きがあることを示します（`hooks/useHiddenEdges.ts`、`styles/tabs.css`）。
- 運用アラート（上部バーのベル。`components/OperationsAlertBadge.tsx`）: `GET /operations-alerts`で、開けるすべてのProjectのアラートを数え、Projectの画面でも全体設定でも出します。一覧の各行にProject名（開いたときに`GET /projects`で引く）を付け、開いているProjectのものを先に並べます（`lib/operationsAlertOrder.ts`）。`--bp-sm`未満では一覧をベルの下に吊るさず、上部バーのすぐ下に画面の左右16pxを空けて出します（`styles/operations.css`）。
- 音声の波形: タッチでは縦のスワイプ（とピンチ）はページのスクロールと拡大に使い、横のドラッグだけが再生位置の移動とループ範囲の選択になります（`styles/audio.css`の`touch-action`）。サーバーが作った全体の波形は、押した瞬間ではなくクリック（タップ）で移動します。
- Runの比較の［Artifacts］: 各Runの表示は枠の幅に収め、長い1行のテキストはその表示の中だけで横にスクロールします。
- ダイアログ: `components/Dialog.tsx`は`--bp-sm`未満で全画面になります。`fullScreenOnNarrow={false}`を渡すと、全画面ではなく下から出るシートになります（`ConfirmDialog`はシート）。閉じると（Esc、×、キャンセル、保存）、開いたときにフォーカスがあった要素（開いたボタン）へフォーカスを戻します（`hooks/useModalDialog.ts`）。呼び出し側は開いたダイアログを外す（`{open && <XxxDialog />}`）ので、ブラウザが`close()`で戻す仕組みは使えないためです。開いたボタンが閉じるまでに画面から消えたとき（閉じたメニューの項目など）は戻しません。開いたときは最初の入力欄にフォーカスを置き（入力欄が無いときは×）、タッチ画面（`(pointer: coarse)`）では画面のキーボードが出てダイアログを隠さないよう、ダイアログそのものに置きます。長いフォームでも［保存］［キャンセル］が見えるよう、`footer`をダイアログの下端に固定します（`styles/forms.css`）。

## キーボードと読み上げ

- ページのタイトル: `components/PageHeader.tsx`が、見出しと、その上の小さな行（Projectの名前、「全体設定」など）の文字から、ブラウザのタブのタイトル「見出し · Project · mado ML Tracking」を付けます（`hooks/usePageDocumentTitle.ts`、`lib/documentTitle.ts`）。見出しを要素で組んだ画面（Runの詳細）も、読める文字のとおりになります。
- メトリクスの図（`components/charts/MetricsChart.tsx`）: 図そのものが1つのフォーカスの止まり先（`role="application"`）で、recharts自身のキーボードの層は切っています。←→・Home・Endで値を出す位置を動かし（ツールチップに出る）、+と-で拡大・縮小、Escで値を隠します。Ctrl・Cmd・Altと一緒のキーはブラウザの操作（ページの拡大・縮小、戻る・進む）なので受け取りません（`isBrowserShortcut`）。recharts の描画領域の中の線・帯・ドラッグは`components/charts/ChartPlotLayer.tsx`です。止まり先と拡大の計算は`lib/chartKeyboard.ts`、読み上げの要約（線ごとの最新の値と最小・最大）は`lib/chartSummary.ts`です。拡大した範囲を取り直す間も`ChartPanel`は前の線を描いたままにし、図を外しません（外すと拡大を忘れ、［ズームを戻す］が消えるため）。SweepとRunの分析の散布図はrechartsのキーボードの層（←→で点を移る）を使い、`title`で名前を付けます。
- 線の色と形: `lib/seriesColors.ts`が、8本までは色覚に配慮した順の8色（ライトとダークで別の段）と、実線・破線・点線・一点鎖線をこの順に割り当てます。どれも図の背景に対して3:1以上で、`lib/seriesColors.test.ts`が確かめます。9本以上はIDから色相を決め、背景とのコントラストで明るさを決めます。割り当ては図ごとではなく、`MetricsChart`の`styleIds`（`ChartPanel`が渡す画面のRun全体）の並びで決めるので、ある指標を記録していないRunがあっても同じRunはどの図でも同じ色と形です。8本を超えるかも画面のRun数で決めます。複数のmetricを重ねた図では、色がRun（`styleId`）、線の形がmetricの順です。グループの線や1つのRunのmetricの線のように画面のRunに無い線は、その図の線の中で決めます。凡例とツールチップの見本（`components/charts/SeriesSwatch.tsx`）も同じ形で描きます。軸の文字と線は`--muted`です（`styles/charts.css`）。平行座標の青の段階も、両端を3:1以上の段に詰めています（`lib/parallelCoordinates.ts`）。
- 開いて閉じる欄: 上部バーのポップオーバー（`hooks/usePopover.ts`）は、中にフォーカスがあるときのEscで開いたボタンへ戻します。ユーザーメニューは↓↑で開いて項目を移れるメニューボタンです。ページの上に浮く`<details>`（［表示する列］、保存ビュー、図の［配置］、分析の軸）は、`lib/detailsPopover.ts`の処理でEscとTabで外へ出たときに閉じます。
- 自動の検査: `apps/web/tests/browser-accessibility.mjs`は、環境変数`MMT_AXE_CORE_PATH`にaxe-coreの`axe.min.js`を渡すと、主な画面でWCAG 2.1 A/AAの違反が無いことも確かめます（axe-coreはこのリポジトリの依存にしていません）。

## 候補つきの入力欄

`FormField`に`suggest`（入力値と`AbortSignal`を受けて候補と注記を返す関数）を渡すと、`components/FormFields.tsx`はその欄を`components/SuggestionInput.tsx`（ARIAのcombobox）で描きます。候補は入力が止まってから（`hooks/useFieldSuggestions.ts`の`FIELD_SUGGESTION_DELAY_MS`）引き、新しい入力が前の要求を中断します。↑↓で選び、EnterかTabで入れ、Escは候補だけを閉じます（周りのダイアログは閉じません）。部品は保存先のAPIを知りません。保存先のルートディレクトリの候補（`GET /admin/storage-directories`）は`dialogs/StorageBackendDialog.tsx`が渡し、無いパス・ファイルの注記は`lib/storageDirectorySuggestions.ts`が決めます。

## 確認ダイアログ

入力欄の無い確認は`components/ConfirmDialog.tsx`を使います。`fields={[]}`の`FormDialog`で代用しません。ボタンは操作そのものの名前（［停止する］［再実行する］［変更を保存］）にし、本文には対象と起きることを書きます。Jobの停止・再実行は`dialogs/JobActionDialog.tsx`、公開範囲・保存先の変更は`components/ProjectSettings.tsx`が確認します。

## テキストのプレビュー

Artifactのテキストのプレビュー（`components/preview/CodeView.tsx`）は、形式に合わせて色を付けます。形式の判定と色付けは、Madoと共有する`@mado/design-system/code`（highlight.jsと、CSV・TSV・ログの色付け）にあります。対応する形式と判定の順は[デザインシステムのREADME](https://github.com/aida0710/mado-design-systems#テキストの色付け)にあります。

- 形式は、ファイル名、メディアタイプ、中身の先頭の順に決めます。どれにも当たらなければ色を付けません。
- プレビューの上の「表示形式」で形式を選び直せます。選んだ形式は拡張子ごとにブラウザの`localStorage`（`mmt.codeLanguage`）に保存し（`hooks/useCodeLanguage.ts`）、同じ拡張子のファイルを次に開いたときにも使います。「自動」に戻すと保存を消します。`.env`と`Dockerfile`は名前で覚えます。何でも入る`.txt`と、拡張子の無いほかのファイルは覚えません。
- プレビューできる大きさは1MiBまで（`TEXT_PREVIEW_MAX_BYTES`）で、色を付けるのは先頭の200,000文字までです。
- 表示は、テーマにかかわらずログと同じ暗い地（`--code-background`）です。

## Artifactのアップロード

`dialogs/ArtifactUploadDialog.tsx`が[再開可能なArtifact upload](api-contract.md#再開可能なartifact-upload)を使います。`multiple`を付けると複数ファイル・フォルダ（`webkitdirectory`とdrag&drop）を受け付け、フォルダ内の相対pathを保存先フォルダの下に置きます。付けないと1ファイルだけで、Artifactができたら呼び出し側が閉じます（コードバージョンの登録）。

- 8MiB未満は従来の単一PUT、8MiB以上はupload sessionでpartに分けて送ります。進み具合を得るため、bodyはXMLHttpRequestで送ります（`api/artifactUploads.ts`）。
- 同時に送るrequestはキュー全体で3本（`hooks/useArtifactUploadQueue.ts`の`MAX_CONCURRENT_REQUESTS`）。partごとに最大5回まで指数backoffで再試行し、それでも失敗したファイルは「失敗」で止まります。
- 一時停止と再開はsessionを残し、再開時に`GET /artifact-uploads/:u`の受信済みpartとの差分だけを送ります。取消は`DELETE`でsessionを`aborted`にします。
- 再読込に備え、localStorageに`{uploadId, projectId, runId, path, name, size, lastModified}`を残します（`lib/uploadResumeStore.ts`。保存できない環境でも送信はできます）。同じファイルを同じ保存パスで選び直すと続きから送ります。localStorageに無いサーバー側の`open` sessionは、受信済みpartのSHA-256が選んだファイルと一致したときだけ使います。
- 送信中はダイアログを閉じられず、ページを離れるときは`beforeunload`で警告します。ダイアログはRunの取得が失敗しても消えないよう、`Resource`の外に置きます。
