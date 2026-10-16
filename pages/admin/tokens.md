---
title: API tokenとService Account
description: 個人のAPI token、人に紐付かないService Account、scope・期限・失効、Jobごとに発行するJob限定token。
---

# API tokenとService Account

SDK、MLflow、worker、CIからAPIを使うときは、API tokenで認証します。tokenには3種類あります。

| 種類 | 所有者 | 発行する場所 | こんなときに向いています |
| --- | --- | --- | --- |
| 個人のAPI token | ログインしたユーザー | ［アカウント］または［プロジェクト設定］の「自分のAPI token」、「SDK・MLflow 3から接続」 | 自分のPCやノートブックからRunを記録する |
| Service Accountのtoken | Service Account（人に紐付かない） | ［プロジェクト設定］の「Service Accounts」 | worker、自動実行、CIなど長く動くもの |
| Job限定token | Runの作成者 | workerがJobごとに自動で受け取る | 実行コードの中からRunへ記録する。人が発行することはありません |

tokenの値は発行したときに1回だけ表示されます。DBにはハッシュと先頭12文字だけを保存し、どの一覧にも値は表示しません。

## scope

tokenで使える操作はscopeで決めます。所有者のProjectのRoleが足りないscopeは選べません。

| scope | できること | 所有者に要るRole |
| --- | --- | --- |
| `read` | 読み取り | Viewer |
| `runs:write` | Runの作成と記録 | Editor |
| `registry:write` | モデル・データセットの登録 | Editor |
| `artifacts:write` | Artifactの保存 | Editor |
| `jobs:write` | Jobの起動と取り消し | Editor |
| `worker:execute` | workerとしてJobを実行 | Admin |
| `admin` | Projectの管理。下の3つを除き、ほかのscopeの操作もすべて含みます | Admin |
| `tokens:manage` | このtokenの範囲内で、tokenとService Accountを発行・管理する | Viewer（Service Accountの管理はAdmin） |
| `audit:read` | 全体の監査ログを読む | 全体管理者（Projectを指定しないtoken） |
| `users:manage` | ユーザーを管理する | 全体管理者（Projectを指定しないtoken） |

`tokens:manage`・`audit:read`・`users:manage`は`admin`に含まれません。名前を指定して付けたtokenだけが持ちます。

tokenで操作するときは、scopeに加えて、所有者の現在の実効Roleも毎回確かめます。所有者をProjectから外したり、Roleを下げたりすると、tokenを失効させなくても、その操作は403になります。

## tokenからtokenを管理する

`tokens:manage`を付けたtokenは、APIでtokenの発行・失効と、Service Accountの作成・変更・token発行ができます。扱えるのは、そのtokenの範囲に収まるtokenだけです。

| 条件 | 外れたとき |
| --- | --- |
| 自分が持つscopeだけを付けられる（`admin`を持っていても、`tokens:manage`・`audit:read`・`users:manage`は自分が持つときだけ） | 403 `scope_exceeds_issuer` |
| Projectに限定したtokenは、同じProjectのtokenだけを扱える | 403 `project_forbidden` |
| 自分の期限より後まで有効なtokenは作れない。期限なしや、省略して既定の365日になる場合も含みます | 403 `token_outlives_issuer` |

失効も同じ条件です。自分より強いtokenは失効できません。発行したtokenの所有者は、呼び出したtokenの所有者です。監査ログには、呼び出したtokenが記録されます。

`audit:read`と`users:manage`は、全体管理者がProjectを指定せずに発行するtokenだけが持てます（ほかは422 `global_scope_requires_unrestricted_token`）。画面のtoken発行はProjectに限定したtokenだけなので、この2つはAPIで発行します。ユーザーの一覧は`admin`と`users:manage`で読めます。作成・変更・一時パスワードの発行には、すべてのscope（`admin`・`tokens:manage`・`audit:read`・`users:manage`）が要ります。

自分のパスワード変更、コンピュータの自分の設定、アーカイブしたProjectの完全な削除は、ブラウザでだけ行えます。

## 期限

画面では7日、30日、90日（既定）、365日に加え、［無期限］、［期間を指定］、［カレンダーで指定］を選べます。［期間を指定］では分・時間・日単位で有効期間を入力します。小数も使え、365日を超える期間も指定できます。［カレンダーで指定］では日付と時刻を選びます。時刻は画面に表示されたブラウザのタイムゾーンで扱います。個人とService Accountのどちらにも使えます。

APIでは`expiresAt: null`が無期限です。未来の日時を指定した場合、日数の上限はありません。省略時は`MMT_TOKEN_DEFAULT_LIFETIME_DAYS`（既定365日）後になります。旧`MMT_TOKEN_MAX_LIFETIME_DAYS`は、新しい設定がない場合だけ既定日数として使います。過去・無効な日時は422 `invalid_expiry`です。

期限が切れたtokenは401になります。期限が近づいたら新しいtokenを発行して差し替えてください。

## 個人のAPI tokenを発行する

1. ユーザーメニューの［アカウント］を開き、「自分のAPI token」の右上の［API tokenを発行］を押します。対象のプロジェクトを選んで［次へ］を押します。［プロジェクト設定］の同じボタンからも発行できます。
2. 名前、用途、有効期限を選んで［保存］を押します。用途を選ぶと必要なscopeにチェックが入ります。scopeのチェックを変えると、用途は「scopeを自分で選ぶ」になります。

| 項目 | 入力値の例 |
| --- | --- |
| 名前 | `laptop-notebook`（どこで使うか分かる名前） |
| 用途 | SDKやMLflowでRunを記録するなら「SDK・MLflow 3から記録する」（既定。`read`、`runs:write`、`registry:write`、`artifacts:write`） |
| 有効期限 | `90日` |

選べる用途は次のとおりです。Roleで持てないscopeを含む用途は表示されません。

| 用途 | scope |
| --- | --- |
| SDK・MLflow 3から記録する | `read`、`runs:write`、`registry:write`、`artifacts:write` |
| コマンドからJobを投入する | `read`、`jobs:write` |
| workerとしてJobを実行する（Service Accountだけ） | `read`、`worker:execute`、`artifacts:write` |
| 読み取りだけ | `read` |
| scopeを自分で選ぶ | チェックしたもの |

「SDK・MLflow 3から記録する」のtokenは、記録のほかに、どこからも使われていないデータセットのバージョンを削除できます。Project adminのtokenなら、Artifactも削除できます（画面で削除できる条件と同じです）。

3. 表示されたtokenを［tokenをコピー］でコピーして、安全な場所に保存します。閉じると二度と表示されません。

画面から発行したtokenは、そのProjectに限定されます。［プロジェクト設定］（または実験の画面の［SDKで記録］）の「SDK・MLflow 3から接続」の［このProject用のAPI tokenを発行］も、同じ画面を開きます。

発行した画面の「設定例」は、Python SDKとMLflow 3の環境変数をまとめたものです。tokenは入っていません。［設定例をコピー］で写してターミナルに貼り付けると`API token:`と聞かれるので、コピーしたtokenを貼り付けます。

ターミナルでは、tokenをコマンドの引数やファイルに書かず、入力して環境変数に入れます。次の例はbashとzsh（macOSの既定）のどちらでも動きます。

```sh
export MMT_API_URL=https://tracking.example.com
printf 'API token: '; read -r -s MMT_API_TOKEN; echo
export MMT_API_TOKEN
```

tokenが使えることは、次のコマンドで確かめられます。tokenのscopeと限定したProjectが表示されます。

```sh
curl -sS -H "Authorization: Bearer $MMT_API_TOKEN" "$MMT_API_URL/api/auth/token"
```

### SSOのユーザーのtokenは7日で止まる

SSOでログインするユーザーのtokenは、最後にブラウザでログインしてから7日（`OIDC_TOKEN_SYNC_MAX_AGE_SECONDS`）を過ぎると、401 `identity_sync_required`で止まります。Authentikでgroupから外したことを確かめるためです。ブラウザで一度ログインすれば、同じtokenがまた使えます（[Authentik（SSO）](/admin/sso)）。

## Service Account

Service Accountは、人に紐付かない、1つのProjectに属するアカウントです。発行した人がProjectを離れても、Service Accountのtokenは止まりません。SSOのtokenの7日の期限も適用されません。

![Projectの「Service Accounts」と「Projectのtoken一覧」](/images/admin-service-accounts.png)

### Service Accountを作る

ProjectのAdminが操作します。APIでは、`tokens:manage`を付けたtokenでも作れます（上の「tokenからtokenを管理する」）。

1. ［プロジェクト設定］の「Service Accounts」で［Service Accountを作成］を押します。
2. 次の値を入力して保存します。

| 項目 | 入力値の例 |
| --- | --- |
| 名前 | `gpu-host-1-worker`（Project内で一意、200文字まで） |
| 説明 | `GPUサーバー1台目のworker` |
| Role | workerなら`Admin`、自動実行の所有者なら`Admin`、読み取りだけのCIなら`Viewer` |

3. 作成した行の［API tokenを発行］を押し、名前、用途、有効期限を選んで保存します。RoleがAdminのService Accountでは、用途は「workerとしてJobを実行する」から始まります。表示されたtokenを控えます。

![Service Accountのtoken発行](/images/admin-token-dialog.png)

選べるscopeは、Service AccountのRoleまでです。`worker:execute`はRoleがAdminのService Accountにだけ発行できます。

用途ごとのscopeの例です。

| 用途 | Role | scope |
| --- | --- | --- |
| worker | Admin | `read`、`worker:execute`、`artifacts:write`。出力のモデル・データセットを登録するなら`registry:write`も |
| 自動実行ルール・昇格policyの所有者 | Admin | tokenは不要（所有者として移管するだけ） |
| CIからRunを記録 | Editor | `read`、`runs:write`、`artifacts:write` |

workerの導入手順は[worker](/compute/worker)、自動実行ルールの所有者をService Accountへ移す手順は[自動実行](/models/automation)を参照してください。

### 止める・変える

- 一時的に止める: 行の［無効化］を押します。そのService Accountのtokenはすべて、次の要求から401になります。［有効化］で戻すと、同じtokenがまた使えます。
- Roleを変える: ［変更］でRoleを選び直します。Roleを下げると、新しいRoleを超えるscopeの操作は403になります。
- 1本だけ止める: 下の「Projectのtoken一覧」で失効させます。

Service Accountは「全体管理」→［ユーザー］にも「Service Account」として表示されますが、ログインはできず、全体管理者にもできません。

## tokenを失効させる

- 自分のtoken: ［プロジェクト設定］の「自分のAPI token」、または［アカウント］の「自分のAPI token」で［失効］を押します。
- Projectのtoken: ProjectのAdminは「Projectのtoken一覧」で、そのProjectに限定された全員とService Accountのtokenを確認し、［失効］で止められます。一覧には所有者、先頭12文字、scope、有効期限、最終使用（5分ごとに更新）が表示されます。

失効させたtokenは次の要求から401になり、元に戻せません。発行と失効は監査ログに「API tokenの発行」（`token.create`）、「API tokenの失効」（`token.revoke`）として残ります。

Projectをアーカイブすると、そのProjectに限定したtoken（Service Accountのものを含む）は、元に戻すまで401になります。Projectを完全に削除すると、そのtokenは失効し、Service Accountは無効になります（[Projectの作成と管理](/admin/projects)）。

### 旧形式のtoken

一覧で「旧形式」と表示されるtokenは、個人が所有するservice tokenです。所有者がProjectを離れると止まるので、Service Accountのtokenへ置き換えてください。稼働中のPlaygroundの旧形式tokenは、期限（2026-10-15）までに置き換えます。

## Job限定token

workerはJobを実行するたびに、そのJobだけで使えるtoken（`mmtj_`で始まる）をAPIから受け取り、実行コードの`MMT_API_TOKEN`と`MLFLOW_TRACKING_TOKEN`に渡します。worker自身のtokenは実行コードに渡しません。人がJob限定tokenを発行・管理することはありません。

- 権限はRunの作成者の現在の実効Roleで決まります。scopeは`read`、`runs:write`、`artifacts:write`、`registry:write`です。
- 書き込めるのは、対象のRun（metrics、params、tags、ログ、入力Dataset、Artifact）、そのRunを生成元とするモデル・データセットのバージョン、そのRunのLogged Model、出力先のModelの作成だけです。同じProjectの別のRun、token発行、Projectの設定、自動実行ルールへの書き込みは403 `job_token_forbidden`になります。
- 読み取りは同じProjectの中ならできます。上流RunのArtifactを取得するときに使います。
- Jobが終わる（完了・失敗・中止）と、tokenは401になります。

実行コードからの使い方は[worker](/compute/worker)を参照してください。

## MLflowのBasic認証

ユーザー名とパスワードしか設定できないツールのために、MLflow互換API（`/api/mlflow/...`）だけはBasic認証も受け付けます。passwordにAPI tokenを入れ、ユーザー名は空でも構いません。ローカルアカウントのパスワードは受け付けません。

```sh
export MLFLOW_TRACKING_USERNAME=token
printf 'API token: '; read -r -s MLFLOW_TRACKING_PASSWORD; echo
export MLFLOW_TRACKING_PASSWORD
```

独自APIへのBasic認証は401 `basic_auth_unsupported`です。MLflowの接続手順は[MLflow 3から記録する](/tracking/mlflow)を参照してください。
