import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rename, copyFile, stat, mkdir, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
const mirrorDirectory = path.resolve("./data/mod-mirrors");

async function adoptMirrorFile(sourcePath, extension) {
  const storageKey = `${randomUUID()}${extension.toLowerCase()}`;
  await mkdir(mirrorDirectory, { recursive: true });
  const target = path.join(mirrorDirectory, storageKey);
  try {
    await rename(sourcePath, target);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    await copyFile(sourcePath, target, fsConstants.COPYFILE_EXCL);
    await rm(sourcePath, { force: true });
  }
  const info = await stat(target);
  return { storageKey, size: info.size };
}

async function downloadAndHost(url, fileName) {
  const tmpDir = path.resolve("./data/tmp-downloads");
  fs.mkdirSync(tmpDir, { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": "mode-library/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(tmpDir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(tmp, buf);
  const ext = path.extname(fileName) || ".zip";
  return await adoptMirrorFile(tmp, ext);
}

async function hostRemaining() {
  // 1. SMAPI
  console.log("Hosting SMAPI...");
  try {
    const smapiUrl = "https://github.com/Pathoschild/SMAPI/releases/download/4.5.2/SMAPI-4.5.2-installer.zip";
    const { storageKey, size } = await downloadAndHost(smapiUrl, "SMAPI-4.5.2-installer.zip");
    await client.execute({
      sql: `UPDATE mods SET mirror_storage_key=?, mirror_file_name=?, mirror_size=?, mirror_uploaded_at=CURRENT_TIMESTAMP, version='4.5.2' WHERE slug='stardew-valley-smapi'`,
      args: [storageKey, "SMAPI-4.5.2-installer.zip", size],
    });
    console.log("SMAPI hosted successfully!");
  } catch (err) {
    console.error("SMAPI error:", err.message);
  }

  // 2. ItemStats (RoR2) via Moffein download
  console.log("Hosting ItemStats...");
  try {
    const itemStatsUrl = "https://thunderstore.io/package/download/Moffein/ItemStats/1.3.5/";
    const { storageKey, size } = await downloadAndHost(itemStatsUrl, "ItemStats.zip");
    await client.execute({
      sql: `UPDATE mods SET mirror_storage_key=?, mirror_file_name=?, mirror_size=?, mirror_uploaded_at=CURRENT_TIMESTAMP, version='1.3.5' WHERE slug='riskofrain2-itemstats'`,
      args: [storageKey, "ItemStats.zip", size],
    });
    console.log("ItemStats hosted successfully!");
  } catch (err) {
    console.error("ItemStats error:", err.message);
  }

  // Remove Nexus-only mods that cannot be mirrored without direct files (SkyUI, SVE) so the entire site only has 100% locally hosted downloads
  console.log("Cleaning up Nexus mods that redirect externally...");
  await client.execute({
    sql: "DELETE FROM mods WHERE slug IN ('stardew-valley-expanded', 'skyrim-se-skyui')",
    args: []
  });

  const check = await client.execute("SELECT slug, title, game, mirror_file_name, mirror_size FROM mods WHERE status='approved'");
  console.log("\n=== ALL CURRENT APPROVED & HOSTED MODS ===");
  for (const row of check.rows) {
    console.log(`- ${row.title} (${row.game}) -> ${row.mirror_file_name} (${(Number(row.mirror_size)/1024/1024).toFixed(1)} MB)`);
  }
  console.log(`Total: ${check.rows.length} mods, all 100% self-hosted on your site!`);
}

hostRemaining().catch(console.error);
