import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// ルートで共有するvitestとTypeScriptの設定と同じく、すべてのworkspaceに1つの設定を使う。
// ルールはmado S3 Data Catalogのapi/とfront/の設定に合わせる。pages/（VitePress）とpython/は
// それぞれ別の道具を使い、scripts/にはworkspaceの外の使い捨ての検証プログラムを置く。
export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', 'pages', 'python', 'scripts', 'artifacts', 'var']),
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // このコードでは、わざと使わない名前に先頭のアンダースコアを付けて示す。rest構文を使った
      // 分割代入でオブジェクトから除く項目（`const { _cursor, ...query } = input`）、コールバックの
      // シグネチャ上必要な引数、コンパイル時の契約の確認（packages/contractsの
      // `type _Run = Expect<...>`）。それ以外の使っていない名前は報告する。
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // テンプレートリテラルの日本語の文は、項目を全角スペース（U+3000）で区切る。普通の文字列では
      // 元から許されている。コードそのものの空白は引き続き検査する。
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  {
    files: ['apps/api/**', 'packages/**', '*.{ts,js}', 'apps/web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwrightのプログラム。本体はNodeで動き、page.evaluateに渡したコールバックはページで動く。
    files: ['apps/web/tests/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '(useLocalizedMemo)' }],
    },
  },
]);
