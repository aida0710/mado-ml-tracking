import { configDefaults, defineConfig } from 'vitest/config';

// APIの結合テストのファイルは、loopbackのmmt_testデータベース（max_connections=100）を
// 共有する。各ファイルが自分のschemaと最大12接続のpoolを作り、migrationとDROP SCHEMA ...
// CASCADEは数百のロックを取る。CPUごとに1ファイルを動かすと"too many clients"や
// "out of shared memory"になったので、これらのファイルは同時にこの数までしか動かさない。
// ほかはすべて並列のまま。
const DATABASE_TEST_FILE_CONCURRENCY = 6;
// CIのホスト型のrunnerはCPUとストレージをPostgreSQLと共有するので、migrationを6つ同時に走らせない。
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
          // maxWorkersが違うvitestのprojectは、別々のグループで動かす必要がある。unitを先に動かす。
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          include: webTestFiles,
          setupFiles: ['apps/web/src/i18n/japaneseTestLocale.ts'],
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
