# mado ML Trackingを起動する

この配布物は、ビルド済みのコンテナからWeb、API、PostgreSQL、プレビュー用workerを起動します。Linux、Docker Engine、Docker Compose v2、HTTPSの入口を用意してください。サーバーでソースをビルドする必要はありません。機能と管理の手順は[ドキュメント](https://aida0710.github.io/mado-ml-tracking/)にあります。

## 運用のディレクトリ

配布物の中身を1つのディレクトリ（以下の例では`~/mado-model-tracking`）へ展開し、そこに運用側のファイルを足して動かします。更新では配布物の中身だけを新しい版に入れ替え、運用側のファイルはそのまま使います。

| ファイル | 出どころ | 内容 |
| --- | --- | --- |
| `compose.yml`、`compose.filesystem-storage.yml` | 配布物 | イメージをdigestで固定したCompose。ホストのディレクトリを保存先にするときの上書き |
| `VERSION`、`images.txt` | 配布物 | 配布の版と、固定したイメージの一覧 |
| `README.md`、`.env.example`、`deploy/`の設定例、`LICENSE`、`NOTICE` | 配布物 | このファイルと設定例 |
| `.env` | 運用側 | 設定と認証情報（mode 600） |
| `compose.override.yml` | 運用側 | その環境だけの上書き（任意。ポート、認証方式など） |
| `deploy/current-release.json` | 運用側 | 動いている版の記録（[動いている版を記録する](#6-動いている版を記録する)） |
| `var/` | 運用側 | バックアップ（`var/backups/`）、受け取った配布物（`var/releases/<tag>/`）、workerのtokenなど |

Composeのproject名は`compose.yml`の`name`で`mado-model-tracking`に固定しているので、ディレクトリの名前にかかわらず同じコンテナとvolumeを使います。v0.4.0までの配布物から入れた環境は、先に[v0.5.0の更新手順](https://github.com/aida0710/mado-ml-tracking/blob/v0.5.0/docs/releases/v0.5.0.md#互換性と更新手順)の2を済ませてください。

`compose.override.yml`と`compose.filesystem-storage.yml`を両方使うときは、`.env`の`COMPOSE_FILE`に3つを並べます（`COMPOSE_FILE`があると、`compose.override.yml`は自動では読まれません）。

```sh
COMPOSE_FILE=compose.yml:compose.override.yml:compose.filesystem-storage.yml
```

配布物の`compose.yml`は、`api`の認証方式を`.env`の`MMT_AUTH_MODE`（無ければ`local`）から読みます。`compose.override.yml`の`api`の`environment`に書いた値は、それより優先されます。

## 設定と初回起動

配布物を展開し、`.env.example`を`.env`へコピーして、所有者だけが読めるようにします。`tag`は入れる版に替えます。

```sh
tag=v0.5.1
mkdir ~/mado-model-tracking
tar -xzf "mado-ml-tracking-$tag.tar.gz" --strip-components=1 -C ~/mado-model-tracking
cd ~/mado-model-tracking
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

## 更新する

新しい版の配布物を受け取って確かめ、バックアップを取ってから、配布物の中身を入れ替えます。DBの更新（migration）は、新しいイメージで`db:migrate`を実行して当てます。APIの起動時には当たりません。今の版のAPIと両立しないDBの更新があるとき、APIとプレビュー用workerを先に止める順番を、手順の中で選べるようにするためです。

始める前に、今の版から入れる版までのリリースノートの「互換性と更新手順」を読みます。`.env`や`compose.override.yml`の書き換え、今の版のAPIと両立しないDBの更新、tokenの発行し直しなどが書かれています。実行中のJobがあるworkerや、処理中のプレビューは、終わるのを待ってください。

`.env`には認証情報が入っています。`cat .env`や、絞り込まない`docker compose config`は値を表示するので使いません。以下のコマンドは、`~/mado-model-tracking`で同じシェルのまま続けて実行します。

### 1. 配布物を受け取って確かめる

`gh`のあるマシンで、配布物とチェックサムを取得し、GitHubのビルド証明を確かめます。`tag`は入れる版に替えます。

```sh
tag=v0.5.2
gh release download "$tag" --repo aida0710/mado-ml-tracking --pattern "mado-ml-tracking-$tag.tar.gz*"
sha256sum -c "mado-ml-tracking-$tag.tar.gz.sha256"
gh attestation verify "mado-ml-tracking-$tag.tar.gz" --repo aida0710/mado-ml-tracking
```

2つのファイルをサーバーの`~/mado-model-tracking/var/releases/<tag>/`（`mkdir -p`で作る）へ置き、チェックサムを確かめて展開します。サーバーで直接取得する場合（`curl -fLO https://github.com/aida0710/mado-ml-tracking/releases/download/<tag>/mado-ml-tracking-<tag>.tar.gz`と`.sha256`）は、ビルド証明を確かめたファイルとSHA-256が同じであることを確かめます。

```sh
cd ~/mado-model-tracking
tag=v0.5.2
release="var/releases/$tag/mado-ml-tracking-$tag"
(cd "var/releases/$tag" && sha256sum -c "mado-ml-tracking-$tag.tar.gz.sha256" && tar -xzf "mado-ml-tracking-$tag.tar.gz")
cat "$release/VERSION"
```

### 2. バックアップを取る

DBのdumpと、入れ替える配布物のファイル、運用側のファイルを、バックアップのディレクトリへ置きます。`pg_restore --list`でdumpを読めること（データのある表の数）を確かめます。

```sh
umask 077
backup="var/backups/release-$tag-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose exec -T postgres pg_dump -U mmt -Fc mmt > "$backup/mmt.dump" < /dev/null
docker compose exec -T postgres pg_restore --list < "$backup/mmt.dump" | grep -c 'TABLE DATA'
cp -p .env compose.yml compose.filesystem-storage.yml VERSION images.txt "$backup/"
for file in compose.override.yml deploy/current-release.json; do
  if [ -f "$file" ]; then cp -p "$file" "$backup/"; fi
done
docker compose ps -a --format '{{.Service}} {{.ID}} {{.Image}} {{.Status}}' > "$backup/containers.txt"
```

Artifactの保存先（`artifacts`のvolume、ホストのディレクトリ、S3）も、DBと同じ時点でバックアップします。DBだけを戻しても、重みや音声のファイルは戻りません。

### 3. 新しいイメージを先に取得する

コンテナを作り直す前に取得しておき、止まる時間を短くします。イメージの版とcommitのラベルが、入れる版と同じことを確かめます。`worker`・`launcher`のプロファイルを動かしているなら、正規表現にそれも足します。

```sh
grep -E '/mado-ml-tracking-(api|web|preview)@' "$release/images.txt" | xargs -n1 docker pull -q
for service in api web preview; do
  docker image inspect --format "$service {{index .Config.Labels \"org.opencontainers.image.version\"}} {{index .Config.Labels \"org.opencontainers.image.revision\"}}" \
    "$(grep "/mado-ml-tracking-$service@" "$release/images.txt")"
done
```

### 4. 切り替える

リリースノートが今の版のAPIと両立しないDBの更新を挙げているときは、先に`docker compose stop api preview`でAPIとプレビュー用workerを止めます。止めている間、Webは502を返します。

配布物の中身をこのディレクトリへ写し、新しいイメージでDBを更新してから、コンテナを作り直します。

```sh
cp -a "$release/." .
docker compose run --rm -T --no-deps api npm run db:migrate -w @mmt/api
docker compose up -d --wait
```

`Migration complete`と出ればDBの更新は終わりです（その前の`../../.env not found. Continuing without it.`は、コンテナの中に`.env`を置いていないことを示すだけです）。`up -d --wait`は、api・preview・webを新しいイメージで作り直し、healthyになるまで待ちます。PostgreSQLは設定が同じなので作り直しません。止まるのは作り直しの間（イメージを取得済みなら十数秒）です。`worker`・`launcher`のプロファイルは`docker compose --profile worker up -d worker`のように別に作り直します。

### 5. 確かめる

```sh
docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
docker compose exec -T web wget -qO- http://127.0.0.1:8080/healthz; echo
docker inspect --format '{{.Config.Image}}' $(docker compose ps -q api web preview)
grep -E '/mado-ml-tracking-(api|web|preview)@' images.txt
docker compose exec -T postgres psql -U mmt -d mmt -At -c 'SELECT max(name) FROM schema_migrations' < /dev/null
```

すべての`STATUS`が`Up`で`api`に`(healthy)`が付き、`/healthz`が`{"status":"ok"}`を返し、動いているイメージが`images.txt`と同じなら切り替え終わりです。最後の行は当たっている最新のmigrationです。前段のHTTPSの入口からも、`/healthz`と画面を開いて確かめます。

### 6. 動いている版を記録する

入れた版、commit、イメージ、DBの状態、バックアップの場所を`deploy/current-release.json`に書きます。戻すときと次の更新のときに、ここから今の状態を読みます。

```sh
image_of() { docker inspect --format '{{.Config.Image}}' "$(docker compose ps -q "$1")"; }
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(image_of api)")
latest_migration=$(docker compose exec -T postgres psql -U mmt -d mmt -At -c 'SELECT max(name) FROM schema_migrations' < /dev/null)
cat > deploy/current-release.json <<EOF
{
  "tag": "v$(cat VERSION)",
  "revision": "$revision",
  "deployedAt": "$(date --iso-8601=seconds)",
  "bundleSha256": "$(cut -d' ' -f1 "var/releases/$tag/mado-ml-tracking-$tag.tar.gz.sha256")",
  "images": {
    "api": "$(image_of api)",
    "web": "$(image_of web)",
    "preview": "$(image_of preview)"
  },
  "latestMigration": "$latest_migration",
  "backupDirectory": "$backup"
}
EOF
cat deploy/current-release.json
```

| 項目 | 内容 |
| --- | --- |
| `tag`、`revision` | 入れた版と、イメージの`org.opencontainers.image.revision`（タグのcommit） |
| `deployedAt` | 切り替えた日時 |
| `bundleSha256` | 受け取った配布物のSHA-256（ビルド証明を確かめたもの） |
| `images` | 動いているコンテナのイメージ（digest付き） |
| `latestMigration` | 当たっている最新のmigration。戻すときにDBを戻す必要があるかの判断に使う |
| `backupDirectory` | この更新の前に取ったバックアップ。前の版のComposeと記録も入っている |

### 7. 古いイメージを片付ける

戻す必要が無くなったら、前の版のイメージを消します。`$backup`はこの更新のバックアップ（`deploy/current-release.json`の`backupDirectory`）です。`var/releases/`の前の版も消してかまいません（戻すときはバックアップのファイルを使います）。

```sh
grep -E '/mado-ml-tracking-(api|web|preview)@' "$backup/images.txt" | xargs docker image rm
```

## 戻す

更新の前の状態は、`deploy/current-release.json`の`backupDirectory`にあります。

```sh
cd ~/mado-model-tracking
backup=$(sed -n 's/.*"backupDirectory": "\(.*\)".*/\1/p' deploy/current-release.json)
```

前の版がDBを読めない更新（列を消す、名前を変えるなど）を当てた後は、先にバックアップのdumpでDBを戻します。バックアップの後に記録されたRun、登録したArtifact、発行したtokenなどは失われます。DBの更新が無い版か、リリースノートが前の版のAPIと両立すると書いている更新なら、DBは戻しません。

```sh
docker compose stop api preview web
docker compose exec -T postgres dropdb -U mmt --force mmt < /dev/null
docker compose exec -T postgres createdb -U mmt mmt < /dev/null
docker compose exec -T postgres pg_restore -U mmt -d mmt --exit-on-error < "$backup/mmt.dump"
```

配布物のファイルと記録をバックアップから戻して作り直します。前の版のイメージを消していても、digestで取得し直します。更新で`.env`や`compose.override.yml`を書き換えたなら、それもバックアップから戻します。

```sh
cp -p "$backup/compose.yml" "$backup/compose.filesystem-storage.yml" "$backup/VERSION" "$backup/images.txt" .
if [ -f "$backup/current-release.json" ]; then cp -p "$backup/current-release.json" deploy/; fi
docker compose up -d --wait
```
