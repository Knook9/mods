// حذف ألعاب القائمة السوداء (data/blocked-games.json) من المكتبة ومن القرص.
// الاستخدام:
//   node scripts/remove-blocked-games.mjs          # عرض فقط
//   node scripts/remove-blocked-games.mjs --apply  # تنفيذ الحذف
import nextEnv from "@next/env";

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@libsql/client";

import blocked from "../data/blocked-games.json" with { type: "json" };

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const mirrorDir = path.resolve(process.env.MOD_MIRROR_DIR || "./data/mod-mirrors");

const ids = [...new Set((blocked.ids ?? []).map(Number).filter(Boolean))];
const slugs = [...new Set((blocked.slugs ?? []).map((value) => String(value).toLowerCase()))];
const names = [...new Set((blocked.names ?? []).map((value) => String(value).toLowerCase()))];

const clauses = [];
const args = [];
if (ids.length) {
  clauses.push(`cf_game_id IN (${ids.map(() => "?").join(",")})`);
  args.push(...ids);
}
if (slugs.length) {
  clauses.push(`lower(coalesce(cf_game_slug, '')) IN (${slugs.map(() => "?").join(",")})`);
  args.push(...slugs);
}
if (names.length) {
  clauses.push(`lower(coalesce(game, '')) IN (${names.map(() => "?").join(",")})`);
  args.push(...names);
}

if (!clauses.length) {
  console.log("قائمة الألعاب المحظورة فارغة.");
  process.exit(0);
}

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const result = await db.execute({
  sql: `SELECT id, slug, title, game, cf_game_slug, mirror_storage_key, mirror_size, upload_storage_key
    FROM mods WHERE ${clauses.join(" OR ")}`,
  args,
});
const rows = result.rows;

if (!rows.length) {
  console.log("لا يوجد شيء لحذفه — المكتبة نظيفة من هذه الألعاب.");
  await db.close();
  process.exit(0);
}

const byGame = new Map();
let mirrorBytes = 0;
for (const row of rows) {
  const key = `${row.game ?? row.cf_game_slug ?? "?"} (${row.cf_game_slug ?? "-"})`;
  byGame.set(key, (byGame.get(key) ?? 0) + 1);
  if (row.mirror_storage_key) mirrorBytes += Number(row.mirror_size ?? 0);
}

console.log(`مودات مستهدفة: ${rows.length}`);
for (const [game, count] of byGame) console.log(`  ${count}\t${game}`);
console.log(`ملفات مستضافة: ${rows.filter((row) => row.mirror_storage_key).length} (${(mirrorBytes / 1024 ** 2).toFixed(1)} م.ب)`);
console.log(`أمثلة: ${rows.slice(0, 5).map((row) => row.title).join(" · ")}`);

if (!apply) {
  console.log("\nعرض فقط. أضف --apply لتنفيذ الحذف.");
  await db.close();
  process.exit(0);
}

let removedFiles = 0;
let missingFiles = 0;
for (const row of rows) {
  if (!row.mirror_storage_key) continue;
  const target = path.join(mirrorDir, String(row.mirror_storage_key));
  try {
    fs.rmSync(target, { force: false });
    removedFiles += 1;
  } catch {
    missingFiles += 1;
  }
}

let deleted = 0;
for (let index = 0; index < rows.length; index += 300) {
  const chunk = rows.slice(index, index + 300).map((row) => row.id);
  const response = await db.execute({
    sql: `DELETE FROM mods WHERE id IN (${chunk.map(() => "?").join(",")})`,
    args: chunk,
  });
  deleted += response.rowsAffected;
}

console.log(`\nحُذف ${deleted} مودًا · ملفات القرص: ${removedFiles} حُذف، ${missingFiles} مفقود أصلًا.`);
await db.close();
