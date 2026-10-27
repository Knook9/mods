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
const tmpDir = path.resolve("./data/tmp-downloads");
fs.mkdirSync(tmpDir, { recursive: true });

const categoryMap = {
  optimization: "تحسين الأداء",
  utility: "أدوات",
  decoration: "الرسوميات",
  adventure: "الاستكشاف",
  storage: "إدارة المخزون",
  equipment: "إضافات المعدات",
  library: "مكتبات مطلوبة",
  mobs: "تحسين الكائنات",
  gameplay: "تحسينات اللعب",
  worldgen: "عوالم جديدة"
};

function translateCategory(raw) {
  if (!raw) return "أدوات";
  const r = String(raw).toLowerCase();
  for (const [k, v] of Object.entries(categoryMap)) {
    if (r.includes(k)) return v;
  }
  return "أدوات";
}

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
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(tmpDir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(tmp, buf);
  const ext = path.extname(fileName) || ".zip";
  return await adoptMirrorFile(tmp, ext);
}

// 1. Modrinth top Minecraft mods
async function importModrinth(targetCount = 110) {
  console.log(`\n=== Importing top ${targetCount} Minecraft mods from Modrinth ===`);
  const offsets = [0, 100];
  let imported = 0;

  for (const offset of offsets) {
    if (imported >= targetCount) break;
    const searchRes = await fetch(`https://api.modrinth.com/v2/search?limit=100&offset=${offset}&index=downloads&facets=[["project_type:mod"]]`, {
      headers: { "User-Agent": "mode-library/1.0" }
    });
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();

    for (const hit of searchData.hits) {
      if (imported >= targetCount) break;
      const slug = `minecraft-${hit.slug}`;

      // تحقق إن كان المود موجوداً ومستضافاً
      const exists = await client.execute({ sql: "SELECT id FROM mods WHERE slug = ? AND mirror_storage_key IS NOT NULL", args: [slug] });
      if (exists.rows.length > 0) continue;

      try {
        const vRes = await fetch(`https://api.modrinth.com/v2/project/${hit.project_id}/version`, { headers: { "User-Agent": "mode-library/1.0" } });
        if (!vRes.ok) continue;
        const vData = await vRes.json();
        const latest = vData[0];
        const primaryFile = latest?.files?.find(f => f.primary) ?? latest?.files?.[0];
        if (!primaryFile || !primaryFile.url) continue;

        // تجاهل الملفات الضخمة فوق 30 ميغابايت للحفاظ على السرعة والمساحة
        if (primaryFile.size > 30 * 1024 * 1024) continue;

        console.log(`[Minecraft ${imported + 1}/${targetCount}] Downloading ${hit.title}...`);
        const { storageKey, size } = await downloadAndHost(primaryFile.url, primaryFile.filename);

        const category = translateCategory(hit.categories?.[0]);
        const desc = hit.description?.slice(0, 500) || hit.title;
        const author = hit.author || "Community";
        const iconUrl = hit.icon_url || null;

        await client.execute({
          sql: `INSERT INTO mods (
            title, slug, game, game_genre, category, description,
            image_url, download_url, download_file_name, download_size,
            source_url, author, version, status, created_by,
            mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
          ) VALUES (?, ?, 'Minecraft', 'Sandbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(slug) DO UPDATE SET
            title = excluded.title,
            image_url = excluded.image_url,
            mirror_storage_key = excluded.mirror_storage_key,
            mirror_file_name = excluded.mirror_file_name,
            mirror_size = excluded.mirror_size,
            mirror_uploaded_at = CURRENT_TIMESTAMP,
            status = 'approved'`,
          args: [
            hit.title,
            slug,
            category,
            desc,
            iconUrl,
            primaryFile.url,
            primaryFile.filename,
            size,
            `https://modrinth.com/mod/${hit.slug}`,
            author,
            latest.version_number,
            storageKey,
            primaryFile.filename,
            size
          ]
        });
        imported++;
      } catch (err) {
        // تخطي واستمر في حال حدوث أي خطأ لملف معين
      }
    }
  }
  console.log(`Imported ${imported} Minecraft mods successfully!`);
}

// 2. Thunderstore top Lethal Company & Valheim mods
async function importThunderstore(community, gameName, gameGenre, targetCount = 60) {
  console.log(`\n=== Importing top ${targetCount} ${gameName} mods from Thunderstore ===`);
  const res = await fetch(`https://thunderstore.io/c/${community}/api/v1/package/`, {
    headers: { "User-Agent": "mode-library/1.0" }
  });
  if (!res.ok) {
    console.error(`Failed to fetch ${community}: ${res.status}`);
    return;
  }
  const pkgs = await res.json();
  const sorted = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0)
                     .sort((a, b) => (b.versions[0]?.downloads || 0) - (a.versions[0]?.downloads || 0));

  let imported = 0;
  for (const pkg of sorted) {
    if (imported >= targetCount) break;
    const slug = `${community}-${pkg.name.toLowerCase()}`;

    const exists = await client.execute({ sql: "SELECT id FROM mods WHERE slug = ? AND mirror_storage_key IS NOT NULL", args: [slug] });
    if (exists.rows.length > 0) continue;

    const v = pkg.versions[0];
    if (!v || !v.download_url) continue;
    if (v.file_size > 25 * 1024 * 1024) continue; // ملفات معقولة الحجم

    try {
      console.log(`[${gameName} ${imported + 1}/${targetCount}] Downloading ${pkg.name}...`);
      const fileName = `${pkg.name}.zip`;
      const { storageKey, size } = await downloadAndHost(v.download_url, fileName);

      const category = translateCategory(pkg.categories?.[0]);
      const desc = v.description?.slice(0, 500) || pkg.name;
      const icon = v.icon || pkg.icon || null;

      await client.execute({
        sql: `INSERT INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          source_url, author, version, status, created_by,
          mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          image_url = excluded.image_url,
          mirror_storage_key = excluded.mirror_storage_key,
          mirror_file_name = excluded.mirror_file_name,
          mirror_size = excluded.mirror_size,
          mirror_uploaded_at = CURRENT_TIMESTAMP,
          status = 'approved'`,
        args: [
          pkg.name,
          slug,
          gameName,
          gameGenre,
          category,
          desc,
          icon,
          v.download_url,
          fileName,
          size,
          pkg.package_url,
          pkg.owner,
          v.version_number,
          storageKey,
          fileName,
          size
        ]
      });
      imported++;
    } catch (e) {
      // استمر
    }
  }
  console.log(`Imported ${imported} ${gameName} mods successfully!`);
}

async function main() {
  await importModrinth(110);
  await importThunderstore("lethal-company", "Lethal Company", "Horror", 65);
  await importThunderstore("valheim", "Valheim", "Survival", 45);

  const total = await client.execute("SELECT COUNT(*) as count FROM mods WHERE status = 'approved' AND mirror_storage_key IS NOT NULL");
  console.log("\n=======================================================");
  console.log(`TOTAL ACTIVE REAL SELF-HOSTED MODS: ${total.rows[0].count}`);
  console.log("=======================================================\n");
}

main().catch(console.error);
