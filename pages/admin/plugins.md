---
title: Plugins（mado S3 Data Catalogへの接続）
description: 全体で1つのmado S3 Data Catalogへの接続の設定と、mado S3 Data Catalogが測ったストレージの容量の確認。
---

# Plugins（mado S3 Data Catalogへの接続）

「Plugins」は、ほかのサービスとの接続を置く画面です。今あるのはmado S3 Data Catalogへの接続だけです。接続は全体で1つで、どのProjectにも共通です。最初は未接続で、接続しなくても実験管理を利用でき、mado S3 Data Catalogへ通信しません。

接続すると、次のことができます。

- データセットやモデルの`s3://`の場所を、mado S3 Data Catalogの画面で開く（Projectを読める人）
- mado S3 Data Catalogの画面のURLを、登録の画面で`s3://`のURIとストレージ接続に直す（Projectを編集できる人）
- mado S3 Data Catalogが測ったストレージの容量を、この画面で確認する（全体管理者）

**ストレージ接続**は、mado S3 Data Catalogに登録したS3の接続先（オンプレミスのS3、AWSなど）の1つです。接続すると、`s3://`の場所を登録するときに、その場所があるストレージ接続を選べるようになります。

この画面を開けるのは全体管理者だけです。mado S3 Data Catalog v0.6.1以降が要ります。

## 接続する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ほかの暗号鍵（`MMT_SESSION_ENCRYPTION_KEY`、`MMT_STORAGE_SECRET_KEY`、`MMT_HOOK_SECRET_KEY`）とは別の値にし、DBと一緒に安全に保管します。再起動ごとに作り直さないでください（[環境変数](/reference/environment#mado-plugin)）。
2. mado S3 Data Catalogの**Settings → Access → Access Tokens**で、Capacityの**読み取り**と、使うストレージ接続（mado S3 Data Catalogの接続）を許可したアクセストークンを発行します。
3. ユーザーメニューかProjectのサイドバーの下端の［全体設定］を開き、サイドバーの「全体管理」で［Plugins］を開きます（`/settings/plugins`）。
4. ［mado S3 Data Catalogに接続］を押し、「URL」と「アクセストークン」を入れて［接続］を押します。「URL」は、ブラウザでmado S3 Data Catalogを開くときのURLです（例: `https://catalog.example.test`）。

［接続］を押すと接続を確かめ、通ったときだけ保存します。通ると「接続済み」になり、アクセストークンの名前、許可されている操作、有効期限、使えるストレージ接続、最後に接続を確認した日時と、「ストレージの容量」（接続・バケット・プレフィックスごと）が出ます。

## 接続を確認・変更・解除する

| ボタン | 何をするか |
| --- | --- |
| ［接続を確認］ | 保存済みのアクセストークンで確かめ直し、許可されている操作と有効期限を読み直します。mado S3 Data Catalogでトークンの許可や期限を変えたあとに押します |
| ［接続を変更］ | URLかアクセストークンを入れ替えます。アクセストークンを空欄にすると、保存済みのものをそのまま使います。URLを変えるときは入力してください |
| ［接続を解除］ | 保存したアクセストークンを消します。もう一度使うには、アクセストークンを入力して接続し直します |

「このアクセストークンでは容量を読めません。」と出たら、mado S3 Data CatalogでアクセストークンにCapacityの読み取りを許可してから、［接続を確認］を押します。

アクセストークンは暗号化して保存し、画面にもAPIにも返しません。`MMT_PLUGIN_SECRET_KEY`を失うと保存済みのトークンを復号できないので、鍵を戻すか、［接続を変更］でアクセストークンを入力し直します。

接続できないときは、[困ったとき](/reference/troubleshooting#plugin-unreachable-or-deliveries-stalled)を見てください。

## ストレージ接続を選んで登録する

接続済みのサイトでは、`s3://`のURIを登録するときにストレージ接続を選べます。選ばなくても登録でき、あとから付けられます。

- **画面**: データセットかモデルのバージョンを作る画面でURIに`s3://`を入れると、「ストレージ接続」の欄が出ます。
- **Python SDK**: `register_dataset`・`register_model`に`data_catalog_storage_connection_id`を渡します。IDは`client.data_catalog(project_id)`の`storageConnections`で引けます。v0.5.4までのSDKにはこの引数がありません。登録はでき、ストレージ接続は未設定になります。
- **API**: 本文の`dataCatalogStorageConnectionId`に入れます。IDは`GET /api/projects/:p/data-catalog`で引けます。

選べるのは、アクセストークンに許可したストレージ接続です。mado S3 Data Catalogでストレージ接続を足したら、トークンに許可してから［接続を確認］を押します。

ストレージ接続は、リンクの行き先を決めるだけです。実行先のコンピュータがどのS3から読むかは、今までどおり実行先の環境変数で決まります。`file://`や`https://`のURI、フォルダから作るバージョン、Jobの出力やMLflowが作るバージョンには、ストレージ接続はありません。

## ストレージ接続をあとから付ける・直す

登録済みのバージョンのストレージ接続は、あとから付ける・別の接続へ直す・外すことができます。Projectを編集できる人が使えます。変わるのはストレージ接続だけで、URIやdigestは変わりません。

- **画面**: データセットかモデルのバージョンのURIの横の［ストレージ接続を設定］（設定済みなら［ストレージ接続を変更］）を押して選びます。「未設定」を選ぶと外れます。
- **Python SDK**: `set_dataset_version_storage_connection`・`set_model_version_storage_connection`を使います。
- **API**: `PUT /api/projects/:p/datasets/:d/versions/:v/data-catalog-storage-connection`（モデルは`models/:m`）に`{"dataCatalogStorageConnectionId": "<ID>"}`を送ります。`null`で外れます。

接続する前に登録したバージョンには、接続したあとにここで付けます。

mado S3 Data Catalogで接続を作り直すと、同じ場所でもストレージ接続のIDが変わります。古いIDを持つバージョンには、リンクの代わりに「ストレージ接続が見つかりません」と出ます。新しいストレージ接続へ直すと、リンクが戻ります。

バージョンが多いときは、**プロジェクト設定 → S3のストレージ接続**でまとめて変えます。このProjectの`s3://`のバージョンが、バケットごとにどのストレージ接続を持つかが並びます。行の［ストレージ接続を設定］か［ストレージ接続を変更］を押すと、そのバケットのデータセットとモデルのバージョンをまとめて付け替えます。

## S3の場所をmado S3 Data Catalogで開く

ストレージ接続を選んで登録したバージョンには、URIの横に［mado S3 Data Catalogで開く］が出ます。押すと、mado S3 Data Catalogのそのフォルダかファイルの画面が別のタブで開きます。中身を見られるかは、mado S3 Data Catalogのログインと権限で決まります。

ストレージ接続の無いバージョン（接続する前や選ばずに登録したもの、Jobの出力など）には出ません。接続を解除したときと、ストレージ接続がアクセストークンの許可から外れたときも出なくなります。

末尾が`/`のURIはフォルダとして、それ以外はファイルとして開きます。

## mado S3 Data CatalogのURLをS3のURIに直す

データセットのバージョンを作る画面の「URI」と、モデルのバージョンを作る画面の「重みのURI」に、mado S3 Data Catalogの画面のURL（フォルダやファイルのメニューの「Web URLをコピー」）を貼ると、対応する`s3://`のURIが欄の下に出ます。［S3のURIに直す］を押すと、欄の値が置き換わり、ストレージ接続も選ばれます。

## 以前のバージョンから更新したとき

v0.5.4までは、接続をProjectごとに持ち、mado S3 Data Catalogのデータセットを取り込み、Runの記録を送っていました。

- Projectごとの接続は引き継ぎません。保存していたアクセストークンは更新のときに消えるので、全体管理者が［Plugins］で接続し直します。
- 取り込んだデータセットバージョンはそのまま残り、Runの入力に使えます。データセット画面は外部参照の値を表示します。新しく取り込むことはできません。
- 送ったRunの記録はDBに残りますが、画面には出しません。
