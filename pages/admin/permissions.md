---
title: 権限とRole
description: 全体管理者とProjectのViewer・Editor・Admin、Projectの公開範囲、直接付与とgroup経由の付与から実効Roleが決まる仕組み。
---

# 権限とRole

権限は「全体管理者かどうか」と「ProjectごとのRole」の2段です。

## 全体設定と全体管理

全体設定は、Projectに属さない設定の画面です（`/settings/<項目>`）。誰でも、右上のユーザーメニューの［全体設定］から開けます。サイドバーの項目は2つの組に分かれます。

| 組 | 項目 | 見える人 |
| --- | --- | --- |
| 全体設定 | アカウント、コンピュータ、このアプリについて | 全員 |
| 全体管理 | プロジェクト、ユーザー、ストレージ、ランチャー、監査ログ | 全体管理者だけ |

これらの組は全体設定の画面のサイドバーにだけ出て、Projectの画面のサイドバーには出ません。全体管理者でない人には「全体管理」の組が出ず、そのURLを直接開いても［アカウント］へ移り、「開こうとした画面は全体管理者だけが使えます」と出ます。

Projectの画面から全体設定を開いたときは、画面の上に「『Project名』に戻る」が出ます。押すと、開く前の画面（Jobsなど）へ戻ります。

![一般の利用者のユーザーメニュー。アカウント、パスワードの変更、全体設定が並ぶ](/images/admin-user-menu.png)

右上のユーザーメニューには、［アカウント］、［パスワードの変更］（ローカルアカウントだけ）、［全体設定］、［ログアウト］が並びます（[認証方式とローカルアカウント](/admin/auth#check-your-account)）。

［このアプリについて］（`/settings/about`）には、動いているWebの版、ビルドしたコミットとその日付、リポジトリが出ます。

## 全体管理者

全体管理者は、アプリ全体の設定を扱います。主な画面は、右上のユーザーメニューの［全体設定］を開いたときのサイドバーの「全体管理」の組から開きます。

- すべてのProjectの一覧、アーカイブしたProjectを元に戻す・完全に削除する（「全体管理」→［プロジェクト］。[Projectの作成と管理](/admin/projects)）
- ユーザーの作成・無効化・パスワード再設定（「全体管理」→［ユーザー］）
- Artifactの保存先の追加と既定の保存先（「全体管理」→［ストレージ］。[保存先](/data/storage)）
- ランチャーの登録（「全体管理」→［ランチャー］）
- 全体の監査ログ（「全体管理」→［監査ログ］）
- SSH・Localのコンピュータを足す。すべてのコンピュータの設定と公開範囲を変える（全体設定の「コンピュータ」。[コンピュータと公開範囲](/compute/computers)）。ただし、ほかの人のPrivateのコンピュータでJobは動かせません。siteは研究者も足せます
- 通知先の作成・変更・テスト送信（[通知と運用アラート](/admin/notifications)）
- Mado連携の設定と有効切替（[Mado連携](/admin/plugins)）

SSOのユーザーが全体管理者かどうかは、Authentikのgroupで決まります（[Authentik（SSO）](/admin/sso)）。ローカルアカウントは、「全体管理」→［ユーザー］の［管理者にする］［管理者を外す］で変えます。

全体管理者は、ブラウザでログインしていれば、どのProjectもAdminとして操作できます。メンバーでないProjectやPrivateのProjectも同じです。API tokenでは、全体管理者でもそのProjectのRoleが必要です。

## ProjectのRole

| Role | できること |
| --- | --- |
| Viewer | 実験、Run、モデル、データセット、Artifactを見る |
| Editor | Viewerに加えて、実験の記録、モデル・データセットの登録（使われていないデータセットのバージョンの削除を含む）、Jobの実行と自分が起動したJobの停止・再実行、aliasの変更（保護aliasは、合格した昇格判定がある場合だけ） |
| Admin | Editorに加えて、ほかの人が起動したJobの停止・再実行、Projectの設定（説明、公開範囲、保存先）、メンバーとgroupへの付与、Service Account、Projectのtoken一覧、通知ルール、自動実行の所有者の移管、Artifactの削除、Mado連携の利用（接続確認、データセットの取り込み、再送）、Projectの監査ログ、Projectのアーカイブ |

Projectは、無効化されていないユーザーなら誰でも作成できます。Projectの切り替えの一番下にある［＋ プロジェクトを作成］を押します。作成した人がそのProjectのAdminになります。手順は[Projectの作成と管理](/admin/projects)を参照してください。

## Projectの公開範囲

Projectの公開範囲には、PublicとPrivateがあります。新しいProjectの既定はPublicです。

| 公開範囲 | 見られる人 |
| --- | --- |
| Public | ログインできる全員。メンバーに追加しなくても、Editorとして使えます |
| Private | メンバー（直接付与、groupへの付与）だけ |

- Adminは、Publicでもメンバーにだけ付きます。
- PublicのProjectでViewerを付けた人も、実際にはEditorとして使えます。「Members」の実効Roleは「Editor（Public）」と出て、［メンバーを追加］でViewerを選ぶとその旨が出ます。見るだけにしたいときはPrivateにします。
- Publicの権限が付くのは有効な人のアカウントだけで、Service Accountとランチャーには付きません。
- 公開範囲は、ProjectのAdminが［プロジェクト設定］の「プロジェクト」で変えます。公開範囲の機能が入る前からあるProjectは、更新したときにPrivateになります。

詳しくは[Projectの作成と管理](/admin/projects#visibility)を参照してください。

## コンピュータの公開範囲

Jobを動かすコンピュータにも、Projectとは別にPublicとPrivateがあります。Publicのコンピュータは、どのProjectのJobも動かせます。Privateのコンピュータでは、ProjectのRoleに関係なく、所有者（足した人）と、所有者が作ったService AccountのJobだけが動きます。全体管理者も例外ではありません。詳しくは[コンピュータと公開範囲](/compute/computers#visibility)を参照してください。

## 直接付与とgroupへの付与

ProjectのRoleは2つの方法で付けます。どちらもProjectのAdminが［プロジェクト設定］で設定します。

![Projectの「Members」と「Authentik group」](/images/admin-permissions.png)

| 方法 | 付ける相手 | 設定する場所 |
| --- | --- | --- |
| 直接付与 | ユーザー1人 | 「Members」の［メンバーを追加］ |
| groupへの付与 | Authentikのgroup | 「Authentik group」の［groupを追加］ |

実効Roleは、直接付与と、その人が入っているgroupへの付与のうち、最も強いRoleです。PublicのProjectでは、ログインできる全員に付くEditorも含めて、最も強いRoleになります。

| 直接付与 | groupへの付与 | 実効Role |
| --- | --- | --- |
| Viewer | Editor | Editor |
| Admin | Viewer | Admin |
| なし | Editor | Editor |
| Editor | なし | Editor |

「Members」の一覧では、［実効Role］と［付与元］（「直接付与: Editor」「group mmt-proj-asr-editors」）で、どこから付いたRoleかを確認できます。この一覧には、直接付与かgroupへの付与がある人だけが出ます。Publicで使っているだけの人は出ず、［実効Role］にもPublicのEditorは含みません。

実効Roleの判定は、画面、独自API、MLflow互換API、API token、Job限定tokenのどれでも同じです。

### メンバーを追加する

1. ［プロジェクト設定］の「Members」で［メンバーを追加］を押します。
2. 名前、メールアドレス、ユーザー名の先頭を入力して、候補からユーザーを選びます。SSOのユーザーは、一度ログインするまで候補に出ません。既に直接付与のある人は「既にEditorです。Roleは一覧の［変更］で変えます」のように表示され、選べません。
3. Roleを選んで保存します。最初はEditorが選ばれています（Projectを作るときのメンバーと同じ）。

一覧にそのユーザーが出れば完了です。

Service AccountもMembersの一覧に「Service Account」の印付きで出ます。Roleの変更と無効化は「Service Accounts」の欄で行います。Service Accountの行の［操作］には、［変更］［外す］の代わりに［Service Accountsの欄で変更］が出て、押すとその欄へ移ります。

ProjectのAdmin以外が［プロジェクト設定］を開くと、「プロジェクト」の欄に、変更できるAdminの名前が出ます。

### 直接付与を外す

対象の行で［外す］を押します。groupへの付与で得ているRoleは残ります。groupのRoleだけが残る場合は、確認のダイアログに「groupで付与されたRoleは残ります。」と表示されます。

## Projectには常にAdminが要る

Projectには、直接付与のAdminか、誰かがログインしたことのあるgroupへのAdminの付与が1つ以上必要です。最後の1つの行では［変更］［外す］が押せず、「最後のAdminなので変更・削除できません。」と理由が表示されます。APIで外したり下げたりする操作も409になります。先に別のメンバーか、誰かがログインしたことのあるgroupへAdminを付けてください。

まだ誰もログインしていないgroupへのAdminの付与は数えません。group名を打ち間違えたまま最後の人のAdminを外すと、Projectを管理できる人がいなくなるためです。そのようなgroupは「Authentik group」の一覧に「まだ誰もログインしていません」と表示されます。Service AccountのAdminも数えません。

## API tokenの権限

API tokenで操作するときは、tokenのscopeと、tokenの所有者の現在の実効Roleの両方を確かめます。どちらかが足りなければ403です。

- scopeが足りない: 403 `scope_required`
- Roleが足りない、またはtokenを限定したProjectと違う: 403 `project_forbidden`

所有者をProjectから外すと、その人のtokenは次の要求からそのProjectで使えなくなります。scopeとRoleの対応は[API tokenとService Account](/admin/tokens)を参照してください。

## 権限の変更の記録

直接付与とgroupへの付与、公開範囲の変更は、監査ログに残ります（[監査ログ](/admin/audit)）。

| 操作 | 監査ログの操作名 |
| --- | --- |
| 公開範囲の変更 | `project.update` |
| 直接付与の追加・変更 | メンバーの権限変更（`project.member.set`） |
| 直接付与を外す | メンバーの直接付与の削除（`project.member.delete`） |
| groupへの付与の追加・変更 | groupへの権限付与（`project.group_binding.set`） |
| groupへの付与を外す | groupへの付与の削除（`project.group_binding.delete`） |
