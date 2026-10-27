---
title: コンピュータと公開範囲
description: Jobを動かすコンピュータ（SSH・Local・site）を全体設定の「コンピュータ」で足し、公開範囲（Public・Private）で使える人を決める。所有者、フックや自動実行の扱い、プロジェクトの使えるコンピュータとの関係。
---

# コンピュータと公開範囲

![全体設定の「コンピュータ」。すべてのコンピュータの種類・所有者・公開範囲・状態と、自分が使えるかが並ぶ](/images/compute-computers.png)

コンピュータは、Jobを動かす先の登録です。種類は3つあります。

| 種類 | 内容 | 手順 |
| --- | --- | --- |
| SSH | workerがSSHで入って動かすGPUマシン | [SSH・Localのコンピュータ](/compute/targets) |
| Local | workerのホストそのもの。開発モードでだけ使えます | [SSH・Localのコンピュータ](/compute/targets) |
| Site | スパコン、研究室のGPUサーバー、自分のPC。ランチャーか`mado-tracking submit`で投入します | [外部のコンピュータ（site）](/compute/sites) |

コンピュータはProjectに属しません。全体設定の「コンピュータ」でまとめて足し、コンピュータごとの公開範囲（PublicかPrivate）で、誰のJobが動くかを決めます。

## こんなときに向いています

- 自分のPCや研究室のGPUサーバーを足して、自分の実験だけで使いたい
- みんなで使うGPUサーバーを、どのProjectからも使えるようにしたい
- ほかの人がどんなコンピュータを足しているか、今使えるかを見たい

## 全体設定の「コンピュータ」を開く

右上のユーザーメニューの［全体設定］を押し、サイドバーの「全体設定」で［コンピュータ］を開きます（`/settings/computers`）。全体設定は、全体管理者でなくても誰でも開けます。プロジェクトの［使えるコンピュータ］の［全体設定の「コンピュータ」を開く］からも移れます。

一覧には、ほかの人のPrivateのものも含めて、すべてのコンピュータが出ます。

| 列 | 内容 |
| --- | --- |
| 名前 | 自分が使える、または管理できるコンピュータは、名前を押すと一覧の下に詳細が開きます |
| 種類 | SSH、Local、Site。CPUアーキテクチャと、siteなら自動投入・手動投入・array対応 |
| 所有者 | コンピュータを足した人。自分のものは「自分」、所有者のいないものは「全体」 |
| 公開範囲 | PublicかPrivate。Privateには鍵の印が付きます |
| 状態 | 有効か無効か。自動投入のsiteでは、ランチャーの応答が無い・失効しているといった様子も出ます |
| 自分が使えるか | 自分のJobがそのコンピュータで動くか |
| 操作 | 所有者と全体管理者にだけ、［コンピュータを編集］［無効にする］（SSH・Localでは［接続を確認］も）が出ます |

自分が使えないコンピュータ（ほかの人のPrivate）は、名前・種類・所有者・公開範囲・状態だけが出ます。接続先、アカウント、パス、job shellは出ません。

## コンピュータを足す

誰でも、自分のコンピュータを足せます。足した人がそのコンピュータの所有者になります。

| 誰が | 足せるもの |
| --- | --- |
| 全体管理者 | SSH、Site。開発モードではLocalも |
| ほかの人（研究者） | Siteだけ |

1. 全体設定の「コンピュータ」で、［コンピュータを追加］を押します。
2. 名前を入れ、［公開範囲］を選びます。既定はPrivateです。全体管理者は［種類］も選びます（SSH・Site。開発モードではLocalも）。
3. 種類ごとの項目を入れて保存します。
   - SSH・Localは2段で足します。1段目「接続」で接続先と接続に使うworkerを選んで［接続を確認して次へ］を押し、2段目「接続後の設定」で作業ディレクトリなどを確かめて［保存］を押します。手順は[SSH・Localのコンピュータ](/compute/targets#register-a-target)です。
   - siteは1枚の画面で項目を入れて［保存］を押します。手順は[外部のコンピュータ（site）](/compute/sites#add-a-computer)です。

保存すると、そのコンピュータの詳細が一覧の下に開きます。SSH・Localは、1段目を終えた時点で無効のまま一覧に入り、2段目で［有効］にして保存すると使えるようになります。

## 公開範囲 {#visibility}

| 公開範囲 | Jobを動かせる人 |
| --- | --- |
| Public | 誰でも。どのProjectのJobも動かせます |
| Private | 所有者本人と、所有者が作ったService Account |

Privateでは、Jobを誰の権限で動かすかで判定します。

| Jobの起こし方 | 判定に使う人 |
| --- | --- |
| 画面、Python SDK、APIでJobを作る・Taskを実行する・再実行する | Runを作った人（API tokenなら、tokenの所有者） |
| フック | フックの所有者 |
| 自動実行ルール | ルールの所有者（[Service Accountへ移したとき](/models/automation#move-rule-ownership)はそのService Account） |
| Sweep | Sweepを作った人 |

- 所有者が作ったService Accountとは、所有者がProjectのAdminとして作ったService Accountです。ほかの人が作ったService Accountは、所有者のPrivateのコンピュータを使えません。
- Service Accountは「自分の設定」を持てないので、本人のアカウントで投入するsiteは使えません（[外部のコンピュータ（site）](/compute/sites#keys-and-connection-checks)）。
- 全体管理者でも、所有者でなければPrivateのコンピュータでJobを動かせません。設定を変える、無効にする、Publicに変えることはできます。

使えないコンピュータにJobを作ろうとすると、422 `target_not_available`になります。Task、自動実行ルール、フック、Sweepは、保存するときにも同じことを確かめます。

### 公開範囲を変える

所有者か全体管理者が、一覧の［コンピュータを編集］で［公開範囲］を選び直して保存します。変更は監査ログ（`compute_target.update`）に残ります。

- 所有者のいないコンピュータは、Publicのままです。Privateにはできません（422 `target_owner_missing`）。
- Jobを作ったあとでPrivateに変わったコンピュータでは、使えなくなった人の待機中のJobは、投入のときに失敗します（`submit_failed`）。実行中のJobは止まりません。

### 公開範囲が入る前からあるコンピュータ

公開範囲が入る前からあるコンピュータは、次のようになりました。

- 所有者のいないもの（全体管理者が足したもの）はPublic
- 所有者のいるもの（研究者が足したsite）はPrivate

以前のProjectへの共有はなくなりました。共有していたコンピュータをほかの人にも使ってもらうときは、所有者がPublicにします。

## プロジェクトの使えるコンピュータ

![プロジェクトの使えるコンピュータ。自分が使えるコンピュータの一覧とWorkers](/images/compute-targets.png)

プロジェクトの［使えるコンピュータ］には、自分が使えるコンピュータの一覧（読むだけ）と、このProjectに接続しているworkerの状態（［Workers］）が出ます。コンピュータの追加や設定は、右上の［全体設定の「コンピュータ」を開く］から全体設定で行います。

プロジェクトで使えるコンピュータが1台も無いうちは、Jobを動かす機能（Sweeps・Tasks・Code・Workflows・Jobs・Hooks・使えるコンピュータと、Modelsの［自動実行ルール］［自動実行履歴］［昇格ポリシー］［Aliasの保護］）をサイドバーとModelsの画面に出しません。使えるコンピュータを追加すると出ます。プロジェクト設定の上にも、このことと全体設定の「コンピュータ」へのリンクを出します。

Jobを作る画面の実行先にも、自分が使えるコンピュータだけが出ます。

## ほかの人のコンピュータを使う前に

Publicのコンピュータを使うことは、その所有者を信頼することです。所有者と全体管理者は、job shellやrunnerの報告先を決められます。コンピュータの上では、Jobの仕様の置き場（Job tokenを含む）も読めます。Job tokenはそのJobのRunにしか書けませんが、Projectのデータは読めます。

本人のアカウントで動くsiteでは、所有者が決めたjob shellがあなたのアカウントで動きます。詳しくは[外部のコンピュータ（site）](/compute/sites#before-you-use-someone-elses-computer)を参照してください。

## 権限

| 操作 | できる人 |
| --- | --- |
| 全体設定の「コンピュータ」を開き、すべてのコンピュータの名前・種類・所有者・公開範囲・状態を見る | ログインしている人 |
| siteを足す | ログインしている人 |
| SSH・Localを足す | 全体管理者 |
| 設定・公開範囲の変更、有効と無効の切り替え、接続確認、job shellの保存、共用アカウントの鍵 | 所有者か全体管理者 |
| Jobを動かす | Publicは誰でも。Privateは所有者と、所有者が作ったService Account |

## APIで操作する

| 操作 | API | 必要な権限 |
| --- | --- | --- |
| すべてのコンピュータの一覧 | `GET /api/targets/overview` | `read`。各行の`usable`は自分のJobが動くか、`canManage`は管理できるか |
| 使える・管理するコンピュータの詳細 | `GET /api/targets`（`?projectId=<Project ID>`で、使えるものだけ） | `read` |
| 足す | `POST /api/targets`（`visibility`は`public`か`private`。省くと`private`） | ブラウザでログインした人（siteだけ。API tokenでは403 `session_required`）。全体管理者はSSH・Localも足せ、`admin` scopeのtokenも使えます |
| 設定・公開範囲の変更 | `PATCH /api/targets/<ID>`（`visibility`など） | 所有者（ブラウザでログインしたとき）か全体管理者（`admin` scopeのtokenも使えます）。ほかの人は403 `target_owner_required` |

研究者がSSH・Localを足そうとすると403 `target_admin_required`、使えないsiteのjob shell・鍵・自分の設定を開くと403 `target_not_available`になります。詳しくは[独自API](/reference/api)を参照してください。
