import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// One config for every workspace, like the shared vitest and TypeScript setup at the root. The
// rule sets follow Mado's api/ and front/ configs; pages/ (VitePress) and python/ have their own
// tooling, and scripts/ holds one-off verification programs outside the workspaces.
export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', 'pages', 'python', 'scripts', 'artifacts', 'var']),
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // The code base marks a binding as deliberately unused with a leading underscore: fields
      // dropped from an object with rest destructuring (`const { _cursor, ...query } = input`),
      // parameters a callback signature requires, and compile-time contract checks
      // (`type _Run = Expect<...>` in packages/contracts). Any other unused binding is reported.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Japanese text in template literals separates fields with the ideographic space (U+3000),
      // as plain strings already may; whitespace in the code itself is still checked.
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  {
    files: ['apps/api/**', 'packages/**', '*.{ts,js}', 'apps/web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright programs: they run in Node, and the callbacks given to page.evaluate run in the page.
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
