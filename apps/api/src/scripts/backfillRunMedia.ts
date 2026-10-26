import { rejectReplacedEnvironmentVariables } from '@mmt/platform';
import { requireDatabaseUrl } from '../db/databaseSettings.js';
import { pathToFileURL } from 'node:url';
import { createDatabase, transaction, type Database } from '../db/database.js';
import { listRunImageArtifacts } from '../repositories/runMediaRepository.js';
import { indexMlflowMediaArtifact } from '../services/runMediaIndexer.js';

// 1ページごとに短いトランザクションにし、忙しいサーバーでbackfillがロックを握り続けないようにする。
const BACKFILL_PAGE_SIZE = 500;

/**
 * Runのメディアの仕組みができる前に保存されたMLflowのlog_image(key=, step=)のファイルを、
 * 保存時のフックと同じ規則で索引に登録する。登録済みのファイルはそのまま残すので、再実行しても
 * 何も増えない。調べた画像Artifactの数を返す。
 */
export async function backfillRunMedia(database: Database): Promise<number> {
  let after: { createdAt: string; id: string } | null = null;
  let examined = 0;
  for (;;) {
    const page = await listRunImageArtifacts(database, { after, limit: BACKFILL_PAGE_SIZE });
    if (page.length === 0) return examined;
    await transaction(database, async (connection) => {
      for (const artifact of page)
        await indexMlflowMediaArtifact(connection, {
          projectId: artifact.projectId,
          runId: artifact.runId,
          artifactId: artifact.id,
          path: artifact.path,
        });
    });
    examined += page.length;
    const last = page.at(-1)!;
    after = { createdAt: last.cursorCreatedAt, id: last.id };
  }
}

async function main(): Promise<void> {
  rejectReplacedEnvironmentVariables(process.env);
  const database = createDatabase(requireDatabaseUrl(process.env));
  try {
    const examined = await backfillRunMedia(database);
    console.log(JSON.stringify({ event: 'run_media_backfill_complete', examinedArtifacts: examined }));
  } finally {
    await database.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
