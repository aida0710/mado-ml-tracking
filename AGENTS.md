# mado ML Tracking の開発の決まり

このリポジトリで作業するときの決まり。機能と構成は[README](README.md)、APIの振る舞いの正本は[API契約](docs/api-contract.md)。

## 構成

- npm workspaces: `apps/api`（Hono API、PostgreSQLのmigration）、`apps/web`（React＋Vite）、`packages/contracts`（APIの型とzodの定義。APIと画面が共有）、`packages/platform`（保存先・通知などAPIとpreview workerが共有する処理）。
- `python/`はPython SDK・worker・launcher（`mado-tracking`）、`pages/`はVitePressのドキュメント（日英）、`deploy/`はnginx・配布物・worker・サイトの設定。
- 依存・lint・vitest・TypeScriptの設定はルートでまとめて管理する（`package.json`、`eslint.config.js`、`vitest.config.ts`、`tsconfig.base.json`）。

## 変更を出す前に通すもの

CIの`.github/workflows/ci.yml`と同じものを手元で通す。

```sh
npm ci
npm run typecheck
npm run lint
npm run build
MMT_TEST_DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/mmt_test npm test
node --test scripts/release/bundle.node-test.mjs
npm audit --omit=dev
python3 -m pytest python/tests   # python/ を変えたとき（SDKを[test,telemetry]付きで入れた環境で）
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs scripts/ci/run-mock-browser-checks.sh <ログのディレクトリ>   # 模擬APIのブラウザ検査
```

- `npm test`はvitestの3つのproject（`unit`・`web`・`database`）。`database`はPostgreSQLが要る。開発用DBとは別の使い捨てのコンテナを127.0.0.1にだけ開いて使い、終わったら消す。
- 画面の操作はPlaywrightのブラウザ検査（`apps/web/tests/browser-*.mjs`、`MMT_PLAYWRIGHT_MODULE`でPlaywrightを指す）で確かめる。手順は[検証手順](docs/verification.md)。
- ESLintの規則は無効にして黙らせない。どうしても例外が要る行だけ、理由を書いた`eslint-disable-next-line <規則> -- 理由`を置く。

## コードの書き方

- 名前は役割を正直に表す。勝手に略さない。同じ概念には同じ言葉を使う（既存のコード・API契約・画面の用語に合わせる）。
- 1ファイル1責務。画面、hook、APIクライアント、純粋なロジック、型は別のファイルに置く。同じ形の処理を3回書かず共通化する。
- 意味のある数値・待ち時間・上限は名前付きの定数にし、なぜその値かを書く。コメントは「なぜ」を書く。
- APIは入力の検証→サービス層の呼び出し→結果の変換だけにし、認可・状態遷移はサービス層に置く。
- UIの文言は`apps/web/src/i18n/`（日本語と`en/`の英語）に置き、使わなくなったキーは同じ変更で消す。
- 下位互換のための扱いは作らない。データの形を変えるときはmigrationで今の形へ移し、旧形式を読むコードを残さない。

## API・DB

- APIの形を変えたら`docs/api-contract.md`と`packages/contracts`を直し、`npm run openapi:generate`で`docs/openapi.json`を作り直す（`apps/api/test/openapi-coverage.test.ts`が食い違いを検出する）。
- migrationは`apps/api/src/db/migrations/`に続きの番号で足す。適用済みのファイルはdigestを照合するので変えない。
- 開発中のAPIはtsxで動かし（`npm run dev`、`npm run db:migrate:dev`）、本番はtscでビルドしたJSをnodeで動かす（[apps/api/README.md](apps/api/README.md)）。

## コミット

- 意味のまとまりごとにコミットする。メッセージは`<type>(<scope>): <日本語の要約>`（type は`feat`・`fix`・`refactor`・`docs`・`test`・`build`・`ci`・`chore`など）で、本文も日本語で書く。
- 認証情報、本番の`.env`、既存の環境のシークレットを出力・転記・コミットしない。
- リリースの手順は[GitHub Releaseとコンテナを公開する](docs/releasing.md)。
