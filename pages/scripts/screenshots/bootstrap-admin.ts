// Creates the first local administrator `admin` of a screenshot environment with a random password
// and writes it to the given file (mode 600). The same as `npm run bootstrap-admin`, which needs a
// terminal; the administrator still has to change the password at the first sign-in.
//   MMT_DATABASE_URL=... tsx pages/scripts/screenshots/bootstrap-admin.ts <password file>
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { createDatabase } from '../../../apps/api/src/db/database.js';
import { bootstrapAdministrator } from '../../../apps/api/src/scripts/bootstrapAdmin.js';

const ADMIN_USERNAME = 'admin';
// 16 random bytes in hex: 32 characters, within the API's password length limits.
const PASSWORD_BYTES = 16;

const passwordFile = process.argv[2];
const databaseUrl = process.env.MMT_DATABASE_URL;
if (!passwordFile || !databaseUrl) throw new Error('usage: MMT_DATABASE_URL=... tsx bootstrap-admin.ts <password file>');

const password = randomBytes(PASSWORD_BYTES).toString('hex');
// The prompter reads the answers line by line: username, password, confirmation.
const answers = new PassThrough();
answers.end(`${ADMIN_USERNAME}\n${password}\n${password}\n`);
const database = createDatabase(databaseUrl);
try {
  await bootstrapAdministrator({ database, terminal: { input: answers, output: new PassThrough() } });
  await writeFile(passwordFile, password, { mode: 0o600 });
  console.log(`created ${ADMIN_USERNAME}; the password is in ${passwordFile}`);
} finally {
  await database.end();
}
