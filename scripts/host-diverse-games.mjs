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

const targetGames = [
  { community: "content-warning", game: "Content Warning", genre: "Horror", count: 8 },
  { community: "repo", game: "R.E.P.O.", genre: "Horror", count: 8 },
  { community: "ultrakill", game: "ULTRAKILL", genre: "Action", count: 8 },
  { community: "rounds", game: "ROUNDS", genre: "Action", count: 8 },
  { community: "gtfo", game: "GTFO", genre: "Action", count: 8 },
  { community: "boneworks", game: "BONEWORKS", genre: "Action", count: 8 },
  { community: "bonelab", game: "BONELAB", genre: "Action", count: 8 },
  { community: "shadows-of-doubt", game: "Shadows of Doubt", genre: "RPG", count: 6 },
  { community: "dyson-sphere-program", game: "Dyson Sphere Program", genre: "Simulation", count: 6 },
  { community: "subnautica", game: "Subnautica", genre: "Survival", count: 6 },
  { community: "subnautica-below-zero", game: "Subnautica: Below Zero", genre: "Survival", count: 6 },
  { community: "sons-of-the-forest", game: "Sons Of The Forest", genre: "Survival", count: 6 },
  { community: "peglin", game: "Peglin", genre: "Roguelike", count: 5 }
];

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
  return "إضافات متنوعة";
}

async function hostDiverseGames() {
  console.log("Starting to download and host real files across diverse games...");

  for (const g of targetGames) {
    try {
      console.log(`\nFetching ${g.game}...`);
      const res = await fetch(`https://thunderstore.io/c/${g.community}/api/v1/package/`, {
        headers: { "User-Agent": "mode-library/1.0" }
      });
      if (!res.ok) continue;

      const pkgs = await res.json();
      const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0 && p.versions[0].file_size < 15 * 1024 * 1024)
                        .sort((a, b) => (b.versions[0]?.downloads || 0) - (a.versions[0]?.downloads || 0))
                        .slice(0, g.count);

      for (const pkg of valid) {
        const v = pkg.versions[0];
        const cleanName = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const slug = `${g.community}-${cleanName}`;

        // تخطي إن كان مستضافاً بالفعل
        const exists = await client.execute({ sql: "SELECT id FROM mods WHERE slug = ? AND mirror_storage_key IS NOT NULL", args: [slug] });
        if (exists.rows.length > 0) continue;

        try {
          console.log(`  Downloading ${pkg.name} (${(v.file_size / 1024 / 1024).toFixed(1)} MB)...`);
          const fileName = `${pkg.name}.zip`;
          const { storageKey, size } = await downloadAndHost(v.download_url, fileName);

          const cat = translateCategory(pkg.categories?.[0]);
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
              g.game,
              g.genre,
              cat,
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
          console.log(`  ✓ Saved & Hosted: ${pkg.name}`);
        } catch (err) {
          console.error(`  Error downloading ${pkg.name}:`, err.message);
        }
      }
    } catch (e) {
      console.error(`Error with ${g.game}:`, e.message);
    }
  }

  const finalRes = await client.execute("SELECT COUNT(*) as total FROM mods WHERE status='approved' AND mirror_storage_key IS NOT NULL");
  const gamesCount = await client.execute("SELECT COUNT(DISTINCT game) as games FROM mods WHERE status='approved' AND mirror_storage_key IS NOT NULL");
  console.log("\n=======================================================");
  console.log(`TOTAL 100% HOSTED MODS ON SITE: ${finalRes.rows[0].total}`);
  console.log(`TOTAL DISTINCT POPULAR GAMES: ${gamesCount.rows[0].games}`);
  console.log("=======================================================\n");
}

hostDiverseGames().catch(console.error);
