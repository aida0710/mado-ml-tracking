import { requireDatabaseUrl } from '../db/databaseSettings.js';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { createDatabase, transaction, type Database } from '../db/database.js';
import { upsertLocalAdministrator } from '../repositories/identityRepository.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  argon2idPasswordHasher,
  isAcceptablePasswordLength,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_BYTES,
  type PasswordHasher,
} from '../auth/passwordHasher.js';

// migration 010のusers.usernameのCHECKと同じ規則。
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const CONTROL_C = '\u0003';
const DELETE = '\u007f';
const BACKSPACE = '\b';

export interface BootstrapTerminal {
  input: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  output: Writable;
}

// 質問を1行ずつ尋ねる。先に打たれた文字は次の質問のために取っておく。入力を隠す質問では
// ターミナルをrawモードにして、パスワードを表示しないようにする。
export function createPrompter(terminal: BootstrapTerminal) {
  const { input, output } = terminal;
  const pendingCharacters: string[] = [];
  let deliver: (() => void) | undefined;
  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    pendingCharacters.push(...chunk);
    deliver?.();
  });
  input.pause();

  function nextLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      let value = '';
      deliver = () => {
        while (pendingCharacters.length > 0) {
          const character = pendingCharacters.shift()!;
          if (character === '\r' || character === '\n') {
            // CRLFの組は2行ではなく1行の終わり。
            if (character === '\r' && pendingCharacters[0] === '\n') pendingCharacters.shift();
            deliver = undefined;
            return resolve(value);
          }
          if (character === CONTROL_C) {
            deliver = undefined;
            return reject(new Error('Interrupted'));
          }
          if (character === DELETE || character === BACKSPACE) value = value.slice(0, -1);
          else if (character >= ' ') value += character;
        }
      };
      deliver();
    });
  }

  return {
    async ask(prompt: string, options: { hidden: boolean }): Promise<string> {
      output.write(prompt);
      if (options.hidden) input.setRawMode?.(true);
      input.resume();
      try {
        return await nextLine();
      } finally {
        input.pause();
        if (options.hidden) {
          input.setRawMode?.(false);
          output.write('\n');
        }
      }
    },
  };
}

export async function bootstrapAdministrator(options: {
  database: Database;
  terminal: BootstrapTerminal;
  passwordHasher?: PasswordHasher;
}): Promise<{ userId: string; username: string }> {
  const { database, terminal } = options;
  const passwordHasher = options.passwordHasher ?? argon2idPasswordHasher;
  const prompter = createPrompter(terminal);
  const username = (await prompter.ask('Admin username: ', { hidden: false })).trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username))
    throw new Error('Username must be 1-64 lowercase letters, digits, dot, underscore, or hyphen');
  const password = await prompter.ask('New admin password: ', { hidden: true });
  const confirmation = await prompter.ask('Confirm password: ', { hidden: true });
  if (password !== confirmation) throw new Error('Passwords do not match');
  if (!isAcceptablePasswordLength(password))
    throw new Error(`Password must be ${PASSWORD_MIN_BYTES}-${PASSWORD_MAX_BYTES} bytes`);
  const passwordHash = await passwordHasher.hash(password);
  const user = await transaction(database, async (connection) => {
    const administrator = await upsertLocalAdministrator(connection, {
      username,
      // users.emailは必須。ローカルの仮の値にして、実在のメールドメインにならないようにする。
      email: `${username}@localhost`,
      displayName: username,
      passwordHash,
    });
    // パスワードをリセットしたら、前のパスワードでログインしたsessionをすべて終える。
    await connection.query(
      'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
      [administrator.id],
    );
    await writeAuditEvent(connection, {
      actorType: 'system',
      action: 'auth.bootstrap_admin',
      outcome: 'success',
      resourceType: 'user',
      resourceId: administrator.id,
      details: { username },
    });
    return administrator;
  });
  terminal.output.write(`Admin ready: ${username} (${user.id}); password change required\n`);
  return { userId: user.id, username };
}

async function main(): Promise<void> {
  if (!stdin.isTTY)
    throw new Error('Password input requires a TTY; run this command in an interactive terminal');
  const database = createDatabase(requireDatabaseUrl(process.env));
  try {
    await bootstrapAdministrator({ database, terminal: { input: stdin, output: stdout } });
  } finally {
    await database.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    // メッセージだけを出す。データベースドライバのエラーに接続設定を表示させない。
    console.error(error instanceof Error ? error.message : 'Bootstrap failed');
    process.exitCode = 1;
  });
}
