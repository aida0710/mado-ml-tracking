import { configDefaults, defineConfig } from 'vitest/config';

// API integration files share the loopback mmt_test database (max_connections=100). Each file
// creates its own schema and a pool of up to 12 connections, and migrations and DROP SCHEMA ...
// CASCADE take hundreds of locks. With one file per CPU the run hit "too many clients" and "out
// of shared memory", so these files run at most this many at a time; everything else stays parallel.
const DATABASE_TEST_FILE_CONCURRENCY = 6;
// The hosted runner shares CPU and storage with PostgreSQL; avoid six concurrent migration runs.
const CI_DATABASE_TEST_FILE_CONCURRENCY = 2;
const databaseTestFiles = ['apps/api/test/**/*.integration.test.ts'];
const webTestFiles = ['apps/web/**/*.{test,spec}.?(c|m)[jt]s?(x)'];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, ...databaseTestFiles, ...webTestFiles],
          // Projects with different maxWorkers must run as separate groups; unit tests go first.
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          include: webTestFiles,
          setupFiles: ['apps/web/src/i18n/japaneseTestLocale.ts'],
          server: {
            deps: {
              // @mado/design-system 0.6.0 の dist は相対の import に拡張子が無く（`from './storage'`）、
              // Node の ESM では解決できない。テストでだけ Vite の解決を通す（アプリのコードとビルドは
              // 変えない。mado S3 Data Catalog も同じ指定）。拡張子を付けた版が出たら、この指定を消す。
              inline: ['@mado/design-system'],
            },
          },
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'database',
          include: databaseTestFiles,
          maxWorkers: process.env.CI === 'true'
            ? CI_DATABASE_TEST_FILE_CONCURRENCY
            : DATABASE_TEST_FILE_CONCURRENCY,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
