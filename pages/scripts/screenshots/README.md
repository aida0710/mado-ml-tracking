# ドキュメントの画像を撮るスクリプト

`pages/` の画面の画像（日本語・英語とも60枚、同じファイル名）を、見本データを入れた開発サーバから撮り直す。言語は `--lang ja`（既定）か `--lang en` で選ぶ。

## 出力先

| 言語 | 画像の置き場所 | 画面の言語とブラウザのlocale |
| --- | --- | --- |
| `ja` | `pages/public/images/` | 日本語、`ja-JP` |
| `en` | `pages/public/images/en/` | 英語、`en-US` |

画面の言語は、言語メニューで選んだときと同じ保存値（`localStorage` の `mmt.locale`）で決める。別の場所へ撮って見比べるときは `MMT_DOCS_OUTPUT_DIR` で出力先を変える。

## 用意するもの

- リポジトリ直下で `npm ci` を済ませる。
- Playwright: `MMT_PLAYWRIGHT_MODULE` に `playwright/index.mjs` の場所。Chromiumを指定するときは `MMT_CHROMIUM_PATH`。
- Python 3.11以上: `httpx`・`numpy`・`Pillow`・`psutil`・`pip`・`mlflow` 3系（`mlflow-skinny` で足りる）。`PYTHONPATH=python/src` で動かす。見本の学習Jobは、このマシンのLocal実行で動き、Jobごとの仮想環境へPyPIから `numpy` を入れる。
- PostgreSQL: `MMT_DOCS_POSTGRES_URL` にサーバのURL（例 `postgresql://user@127.0.0.1:5432/postgres`）。環境ごとのデータベースはスクリプトが作る。

## 環境とスクリプト

| 環境 | ログイン | 既定のポート（API / Web） | データベース | 見本データ | 撮る画像 |
| --- | --- | --- | --- | --- | --- |
| `sample` | 開発ログイン | 4682 / 5682 | `mmt_docs_ja_sample`・`mmt_docs_en_sample` | `seed_sample_project.py`、`seed_quickstart.py` | `capture-sample-project.mjs`（43枚）、`capture-quickstart.mjs`（2枚） |
| `accounts` | ローカルアカウント | 4782 / 5782 | `mmt_docs_ja_accounts`・`mmt_docs_en_accounts` | `seed-accounts.mjs` | `capture-accounts.mjs`（12枚） |

`capture-computer-setup.mjs`（3枚）はAPIをブラウザテストのモック（`apps/web/tests/browserApi.mjs`）で返すので、Webが動いていればよい（既定は `sample` のWeb、`--web-url` で変えられる）。

`serve-environment.mjs` がデータベースの作成、migration、APIとWebの起動をまとめて行う。ポートは `--api-port`・`--web-port`、データベース名は `--database` で変えられる。ログ・PID・Artifact・見本データのIDは `var/docs-screenshots/` の言語と環境ごとのディレクトリに置く（`MMT_DOCS_STATE_DIR` で変えられる）。生成したパスワードもそこに権限600のファイルで置き、画面にも標準出力にも出さない。

## 撮り直す手順（英語の例）

```sh
export MMT_DOCS_POSTGRES_URL=postgresql://user@127.0.0.1:5432/postgres
export MMT_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs
export PYTHONPATH=python/src
S=pages/scripts/screenshots

node $S/serve-environment.mjs start sample --lang en
python $S/seed_sample_project.py --lang en   # 学習・推論・評価・Sweepを実際に動かす（数分）
python $S/seed_quickstart.py --lang en
node $S/capture-sample-project.mjs --lang en
node $S/capture-quickstart.mjs --lang en
node $S/capture-computer-setup.mjs --lang en

node $S/serve-environment.mjs start accounts --lang en
node $S/seed-accounts.mjs --lang en
node $S/capture-accounts.mjs --lang en

node $S/serve-environment.mjs stop sample --lang en   # サーバとworkerを止める。データベースは残る
node $S/serve-environment.mjs drop sample --lang en   # データベースと状態のディレクトリも消す
```

日本語は `--lang en` を外す（`pages/public/images/` の画像を上書きする）。一部だけ撮り直すときは画像の名前を並べる（例 `node $S/capture-sample-project.mjs --lang en data-storage models-tasks`）。`seed_sample_project.py` と `seed_quickstart.py` は、途中で止まっても再実行で続きから進む。`seed-accounts.mjs` が途中で失敗したときは、`drop accounts` してから作り直す。

## 撮る前の確認と、直す場所

- 手元のパスとホスト名は例の値（`/srv/mmt/...`、`worker-1.example.internal` など）に置き換える。ホームディレクトリ、ホスト名、プライベートIP、`MMT_DOCS_FORBIDDEN_TEXT`（カンマ区切り）の文字が画面に残っていれば、その画像は保存しない。
- 英語で撮ると、画面に残った日本語の行を `japanese text in` で始まる行に出す。自動昇格の理由など、サーバーが返す文は日本語のまま残る。
- 画面の文言が変わったら `labels.mjs` を `apps/web/src/i18n/` に合わせる。見本データの名前と文は `seed_sample_project.py`（`SampleText`）、`seed-accounts.mjs`、`seed_quickstart.py` にある。
