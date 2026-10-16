import { requireDatabaseUrl } from './db/databaseSettings.js';
import { createDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';

const database = createDatabase(requireDatabaseUrl(process.env));
try {
  await migrate(database);
  console.log('Migration complete');
} finally {
  await database.end();
}
