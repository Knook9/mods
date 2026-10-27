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
  try { await rename(sourcePath, target); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    await copyFile(sourcePath, target, fsConstants.COPYFILE_EXCL);
    await rm(sourcePath, { force: true });
  }
  const info = await stat(target);
  return { storageKey, size: info.size };
}

async function downloadFile(url, fileName) {
  const tmpDir = path.resolve("./data/tmp-downloads");
  fs.mkdirSync(tmpDir, { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": "mode-library/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(tmpDir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(tmp, buf);
  return await adoptMirrorFile(tmp, path.extname(fileName) || ".zip");
}

async function main() {
  // أضف Terralith كمود مستقل — نحمّله من GitHub Releases لـ Stardust Labs
  // https://github.com/Stardust-Labs-MC/Terralith/releases
  console.log("Fetching Terralith from GitHub...");
  const ghRes = await fetch("https://api.github.com/repos/Stardust-Labs-MC/Terralith/releases/latest", {
    headers: { "User-Agent": "mode-library/1.0" },
  });
  if (ghRes.ok) {
    const rel = await ghRes.json();
    const asset = rel.assets?.find(a => a.name.endsWith(".jar") || a.name.endsWith(".zip"));
    if (asset) {
      console.log(`Terralith: ${asset.name} — ${(asset.size/1024/1024).toFixed(1)} MB`);
      const { storageKey, size } = await downloadFile(asset.browser_download_url, asset.name);

      // أضف كمود Terralith جديد حقيقي
      const slug = "minecraft-terralith";
      await client.execute({
        sql: `INSERT INTO mods (title,slug,game,game_genre,category,description,
              image_url,download_url,download_file_name,download_size,source_url,
              author,version,status,created_by,mirror_storage_key,mirror_file_name,mirror_size,mirror_uploaded_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'approved','hi423179@gmail.com',?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(slug) DO UPDATE SET
              title=excluded.title, mirror_storage_key=excluded.mirror_storage_key,
              mirror_file_name=excluded.mirror_file_name, mirror_size=excluded.mirror_size,
              mirror_uploaded_at=CURRENT_TIMESTAMP, version=excluded.version,
              download_file_name=excluded.download_file_name, status='approved'`,
        args: [
          "Terralith", slug, "Minecraft", "Adventure", "عوالم جديدة",
          "يحدث ثورة شاملة في توليد تضاريس عوالم ماينكرافت بتقديم ما يقارب 100 منطقة بيئية (Biome) جديدة وجبال شاهقة ووديان خلابة دون إضافة كتل خارجية مصطنعة.",
          "https://cdn.modrinth.com/data/8oi3bvq5/images/f3dcab8bb2be9d94943fcfad1fb9709cf9321f8a.jpeg",
          "https://github.com/Stardust-Labs-MC/Terralith/releases",
          asset.name, asset.size,
          "https://github.com/Stardust-Labs-MC/Terralith",
          "Stardust Labs", rel.tag_name,
          storageKey, asset.name, size,
        ],
      });
      console.log(`✓ Terralith مضاف: ${(size/1024/1024).toFixed(1)} MB`);
    } else {
      console.log("No suitable asset found in Terralith release:", rel.assets?.map(a => a.name));
    }
  } else {
    console.log("GitHub API status:", ghRes.status, await ghRes.text().catch(() => ""));
  }

  // عرض الملخص
  const rows = await client.execute(
    "SELECT slug, title, game, mirror_storage_key IS NOT NULL as hosted FROM mods WHERE status='approved' ORDER BY game, title"
  );
  console.log("\n=== الوضع النهائي ===");
  for (const r of rows.rows) {
    console.log(`  ${r.hosted ? "🟢" : "🔗"} ${r.game} — ${r.title}`);
  }
  const hosted = rows.rows.filter(r => r.hosted).length;
  console.log(`\nإجمالي: ${rows.rows.length} مود | ${hosted} مستضاف | ${rows.rows.length - hosted} رابط خارجي`);
}

main().catch(console.error);
