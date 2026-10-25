import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

const MIGRATIONS = new URL('../src/db/migrations/', import.meta.url);

/** Applies one independent migration while preserving migrate()'s checksum ledger. */
export async function applyMigrationFile(database: pg.Pool, name: string): Promise<void> {
  const sql = await readFile(new URL(name, MIGRATIONS), 'utf8');
  await database.query(sql);
  await database.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [
    name,
    createHash('sha256').update(sql).digest('hex'),
  ]);
}

/**
 * Applies the migrations that sort before `firstPending` and records them as migrate() does, so a
 * test can insert rows of the older schema and then let migrate() apply the rest. A later call with
 * a later file applies only the migrations not recorded yet. The harness must be created with
 * applyMigrations: false.
 */
export async function applyMigrationsBefore(
  database: pg.Pool,
  firstPending: string,
): Promise<void> {
  await database.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const earlier = (await readdir(MIGRATIONS))
    .filter((name) => name.endsWith('.sql') && name < firstPending)
    .sort();
  const applied = await database.query<{ name: string }>('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  for (const name of earlier) {
    if (!appliedNames.has(name)) await applyMigrationFile(database, name);
  }
}

// 今のアプリケーションが書く行の形を決める migration。071 は監査ログの `failure` と `ip_address`、
// 072 は token の前置き mado_mt_ と、一覧に残す先頭の長さ。
const ROW_SHAPE_MIGRATIONS = ['071_audit_failure_and_ip_address.sql', '072_token_prefix.sql'];

/**
 * 071 と 072 を、それより前の未適用の migration より先に当てる。068〜070 のテストは行を今の
 * アプリケーションで作り、アプリケーションは監査ログを 071 の形で、token を 072 の形で書くため。
 * 068〜070 は 071・072 が変えるものを読まない。migrate() は当てた分を飛ばす。
 */
export async function applyRowShapeMigrationsAhead(database: pg.Pool): Promise<void> {
  for (const name of ROW_SHAPE_MIGRATIONS) await applyMigrationFile(database, name);
}
