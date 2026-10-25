# mado ML Trackingを起動する

この配布物は、ビルド済みのコンテナからWeb、API、PostgreSQL、プレビュー用workerを起動します。Linux、Docker Engine、Docker Compose v2、HTTPSの入口を用意してください。

## 設定と初回起動

`.env.example`を`.env`へコピーし、所有者だけが読めるようにします。

```sh
cp .env.example .env
chmod 600 .env
openssl rand -hex 24
openssl rand -base64 32
```

生成した値をそれぞれ`MMT_POSTGRES_PASSWORD`と`MMT_STORAGE_SECRET_KEY`へ設定します。`MMT_PUBLIC_URL`と`MMT_WEB_ORIGIN`には利用者が開くHTTPSのURLを書きます。既定の認証方式はローカルアカウントです。

イメージを取得し、DBを起動してmigrationを適用します。初期管理者の作成は、Webを起動する前に行います。

```sh
docker compose pull
docker compose up -d postgres --wait
docker compose run --rm -T api npm run db:migrate -w @mmt/api
docker compose run --rm api npm run bootstrap-admin -w @mmt/api
docker compose up -d
```

管理者の名前とパスワードを対話入力します。初回ログインでパスワード変更を求められます。Webは`127.0.0.1:5182`で待ち受けるため、前段のHTTPSプロキシから接続してください。

## workerとlauncher

学習などをSSH経由で実行するworkerは`worker`プロファイルで起動できます。tokenファイルはuid 10001が読める権限にし、SSH鍵も同じuidの所有とします。接続先の登録とknown_hostsの準備は[workerの導入手順](https://aida0710.github.io/mado-ml-tracking/compute/worker)を参照してください。

```sh
docker compose --profile worker up -d worker
```

サイトへJobを投入するlauncherはuid 10002で動きます。`deploy/sites/examples/launcher.toml`を元に設定・tokenを用意し、`launcher`プロファイルで起動します。詳細は`deploy/sites/README.md`にあります。

```sh
docker compose --profile launcher up -d launcher
```

配布イメージのuidに合わせられない環境では、Composeの`user`と読み書きするディレクトリの所有者を合わせるか、workerのsystemd導入を使います。Forgejoは上流のイメージを使う任意の`forge`プロファイルで、手順は`deploy/forgejo/README.md`にあります。

## 更新とバックアップ

更新前にDBとArtifactの保存先をバックアップしてください。DBの例は次のとおりです。

```sh
docker compose exec -T postgres pg_dump -U mmt -Fc mmt > mmt-backup.dump
```

新しいリリースを展開し、既存の`.env`を置きます。Composeのproject名は`compose.yml`の`name`（`mado-model-tracking`）に固定しているので、展開先のディレクトリが変わっても同じ保存volumeを使います。v0.4.0までのbundleから入れた環境は、project名が展開先のディレクトリ名になっています。`docker compose ls`で確かめ、`.env`に`COMPOSE_PROJECT_NAME=<その名前>`を書いて既存のvolumeを使い続けてください。新しいイメージを取得してmigrationを適用し、コンテナを更新します。実行中のJobがあるworkerや、処理中のプレビューの更新は完了を待ってください。DB更新後の切り戻しには、更新前のバックアップが必要です。

公開時のComposeは5種類のイメージをdigestで固定し、同じリリースで内容が変わることを防ぎます。参照は`images.txt`、配布バージョンは`VERSION`に記録しています。[ドキュメント](https://aida0710.github.io/mado-ml-tracking/)に機能と管理手順があります。
