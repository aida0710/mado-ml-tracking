// スクリーンショットの環境に、最初のローカルの全体管理者`admin`をランダムなパスワードで作り、
// そのパスワードを指定のファイルに書く（mode 600）。`npm run bootstrap-admin`と同じことをするが、
// そちらはターミナルが要る。この全体管理者も、最初のログインでパスワードを変える必要がある。
//   MMT_DATABASE_URL=... tsx pages/scripts/screenshots/bootstrap-admin.ts <password file>
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { createDatabase } from '../../../apps/api/src/db/database.js';
import { bootstrapAdministrator } from '../../../apps/api/src/scripts/bootstrapAdmin.js';

const ADMIN_USERNAME = 'admin';
// 16バイトの乱数を16進数で表すと32文字になり、APIのパスワードの長さの制限に収まる。
const PASSWORD_BYTES = 16;

const passwordFile = process.argv[2];
const databaseUrl = process.env.MMT_DATABASE_URL;
if (!passwordFile || !databaseUrl) throw new Error('usage: MMT_DATABASE_URL=... tsx bootstrap-admin.ts <password file>');

const password = randomBytes(PASSWORD_BYTES).toString('hex');
// 対話の入力は答えを1行ずつ読む。ユーザー名、パスワード、確認の順。
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
