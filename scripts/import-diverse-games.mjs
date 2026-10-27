import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const popularGamesConfig = [
  { community: "lethal-company", name: "Lethal Company", genre: "Horror", limit: 25000 },
  { community: "valheim", name: "Valheim", genre: "Survival", limit: 12000 },
  { community: "repo", name: "R.E.P.O.", genre: "Horror", limit: 6000 },
  { community: "boneworks", name: "BONEWORKS", genre: "Action", limit: 1300 },
  { community: "content-warning", name: "Content Warning", genre: "Horror", limit: 1200 },
  { community: "gtfo", name: "GTFO", genre: "Action", limit: 1200 },
  { community: "rounds", name: "ROUNDS", genre: "Action", limit: 1100 },
  { community: "bonelab", name: "BONELAB", genre: "Action", limit: 1000 },
  { community: "ultrakill", name: "ULTRAKILL", genre: "Action", limit: 1000 },
  { community: "dyson-sphere-program", name: "Dyson Sphere Program", genre: "Simulation", limit: 700 },
  { community: "shadows-of-doubt", name: "Shadows of Doubt", genre: "RPG", limit: 180 },
  { community: "subnautica-below-zero", name: "Subnautica: Below Zero", genre: "Survival", limit: 120 },
  { community: "subnautica", name: "Subnautica", genre: "Survival", limit: 110 },
  { community: "sons-of-the-forest", name: "Sons Of The Forest", genre: "Survival", limit: 80 },
  { community: "peglin", name: "Peglin", genre: "Roguelike", limit: 40 },
  { community: "palworld", name: "Palworld", genre: "Survival", limit: 20 },
  { community: "potion-craft", name: "Potion Craft", genre: "Simulation", limit: 25 }
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
  worldgen: "عوالم جديدة",
  magic: "سحر وقدرات",
  technology: "تقنية وآلات",
  food: "طعام وزراعة",
  audio: "صوتيات وموسيقى",
  skins: "أزياء وتجميل",
  cosmetics: "أزياء وتجميل",
  weapons: "أسلحة ومعدات"
};

function translateCategory(raw) {
  if (!raw) return "أدوات";
  const r = String(raw).toLowerCase();
  for (const [k, v] of Object.entries(categoryMap)) {
    if (r.includes(k)) return v;
  }
  return "إضافات متنوعة";
}

async function getCount() {
  const res = await client.execute("SELECT COUNT(*) as c FROM mods WHERE status = 'approved'");
  return Number(res.rows[0].c);
}

async function importDiverseGames() {
  console.log("\n=======================================================");
  console.log("STARTING DIVERSE POPULAR GAMES INGESTION");
  console.log("=======================================================\n");

  for (const cfg of popularGamesConfig) {
    try {
      console.log(`\nFetching ${cfg.name} (limit: ${cfg.limit})...`);
      const res = await fetch(`https://thunderstore.io/c/${cfg.community}/api/v1/package/`, {
        headers: { "User-Agent": "mode-library/1.0" }
      });
      if (!res.ok) {
        console.error(`Failed ${cfg.name}: ${res.status}`);
        continue;
      }

      const pkgs = await res.json();
      const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0)
                        .slice(0, cfg.limit);

      console.log(`Processing ${valid.length} real mods for ${cfg.name}...`);

      const items = [];
      for (const pkg of valid) {
        const v = pkg.versions[0];
        const cleanPkgName = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const slug = `${cfg.community}-${cleanPkgName}`;
        const cat = translateCategory(pkg.categories?.[0]);
        const desc = v.description?.slice(0, 500) || pkg.name;
        const icon = v.icon || pkg.icon || null;
        const fileName = `${pkg.name}.zip`;

        items.push([
          pkg.name,
          slug,
          cfg.name,
          cfg.genre,
          cat,
          desc,
          icon,
          v.download_url,
          fileName,
          v.file_size || null,
          pkg.package_url,
          pkg.owner,
          v.version_number
        ]);
      }

      // إدخال على دفعات كل دفعة 25 عنصر
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
        const args = chunk.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          source_url, author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;
        await client.execute({ sql, args });
      }

      const currentTotal = await getCount();
      console.log(`✓ Added ${items.length} mods for ${cfg.name} | Total Approved in DB: ${currentTotal}`);
    } catch (err) {
      console.error(`Error with ${cfg.name}:`, err.message);
    }
  }

  const finalTotal = await getCount();
  const gamesRes = await client.execute("SELECT COUNT(DISTINCT game) as games FROM mods WHERE status = 'approved'");
  console.log("\n=======================================================");
  console.log(`FINAL TOTAL APPROVED MODS: ${finalTotal}`);
  console.log(`TOTAL DISTINCT POPULAR GAMES: ${gamesRes.rows[0].games}`);
  console.log("=======================================================\n");
}

importDiverseGames().catch(console.error);
