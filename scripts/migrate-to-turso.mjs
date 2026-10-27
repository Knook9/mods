import nextEnv from "@next/env";
import { createClient } from "@libsql/client";
import path from "node:path";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
if (!url || !authToken) {
  throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local before migrating.");
}

const sourcePath = path.resolve(process.env.DATABASE_PATH || "./data/mods.sqlite");
const source = createClient({ url: `file:${sourcePath.replace(/\\/g, "/")}` });
const target = createClient({ url, authToken });

const createStatements = [
  `CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    game TEXT NOT NULL,
    game_genre TEXT NOT NULL DEFAULT 'Sandbox',
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    download_url TEXT NOT NULL,
    author TEXT NOT NULL,
    version TEXT,
    download_file_name TEXT,
    download_size INTEGER,
    source_url TEXT,
    created_by TEXT,
    upload_storage_key TEXT,
    upload_file_name TEXT,
    upload_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS mod_reviews (
    mod_id INTEGER PRIMARY KEY REFERENCES mods(id) ON DELETE CASCADE,
    report_json TEXT NOT NULL,
    analyzed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_mods_public ON mods(status, created_at DESC)",
];
await target.batch(createStatements);

const existing = await target.execute(`SELECT
  (SELECT COUNT(*) FROM mods) +
  (SELECT COUNT(*) FROM members) +
  (SELECT COUNT(*) FROM mod_reviews) AS count`);
if (Number(existing.rows[0]?.count ?? 0) > 0) {
  throw new Error("The Turso database already contains application records. Migration stopped to avoid overwriting data.");
}

const targetModColumns = [
  "id", "title", "slug", "game", "game_genre", "category", "description", "image_url",
  "download_url", "author", "version", "download_file_name", "download_size", "source_url",
  "created_by", "upload_storage_key", "upload_file_name", "upload_size", "status", "created_at",
];
const sourceModColumns = new Set(
  (await source.execute("PRAGMA table_info(mods)")).rows.map((column) => String(column.name)),
);
const modColumns = targetModColumns.filter((column) => sourceModColumns.has(column));
if (!modColumns.length) throw new Error(`No mods table found in SQLite source ${sourcePath}.`);
const modsResult = await source.execute("SELECT * FROM mods ORDER BY id");
const mods = modsResult.rows;
for (let offset = 0; offset < mods.length; offset += 100) {
  const batch = mods.slice(offset, offset + 100).map((row) => [
    `INSERT INTO mods (${modColumns.join(", ")}) VALUES (${modColumns.map(() => "?").join(", ")})`,
    modColumns.map((column) => row[column] ?? null),
  ]);
  await target.batch(batch, "write");
}

const copyTable = async (table, columns, primaryKey) => {
  const exists = await source.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });
  if (!exists.rows.length) return 0;
  const schema = await source.execute(`PRAGMA table_info(${table})`);
  const available = new Set(schema.rows.map((column) => String(column.name)));
  const selected = columns.filter((column) => available.has(column));
  const result = await source.execute(`SELECT ${selected.join(", ")} FROM ${table}`);
  const rows = result.rows;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100).map((row) => [
      `INSERT INTO ${table} (${selected.join(", ")}) VALUES (${selected.map(() => "?").join(", ")})
       ON CONFLICT(${primaryKey}) DO UPDATE SET ${selected.filter((column) => column !== primaryKey)
         .map((column) => `${column} = excluded.${column}`).join(", ")}`,
      selected.map((column) => row[column] ?? null),
    ]);
    await target.batch(batch, "write");
  }
  return rows.length;
};

const members = await copyTable(
  "members",
  ["email", "name", "image_url", "created_at", "last_login_at"],
  "email",
);
const reviews = await copyTable(
  "mod_reviews",
  ["mod_id", "report_json", "analyzed_at"],
  "mod_id",
);

console.log(`Migrated ${mods.length} mod records, ${members} member records, and ${reviews} review records to Turso.`);
console.log("The original SQLite database was opened read-only and left unchanged.");
await source.close();
await target.close();
