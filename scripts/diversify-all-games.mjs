import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

// حزمة ألعاب كبرى مثل ألعاب Nexus Mods الشهيرة
const majorGames = [
  { community: "valheim", name: "Valheim", genre: "Survival", limit: 6000 },
  { community: "repo", name: "R.E.P.O.", genre: "Horror", limit: 5000 },
  { community: "reskate", name: "ReSkate", genre: "Simulation", limit: 4500 },
  { community: "boneworks", name: "BONEWORKS", genre: "Action", limit: 1300 },
  { community: "content-warning", name: "Content Warning", genre: "Horror", limit: 1200 },
  { community: "gtfo", name: "GTFO", genre: "Action", limit: 1200 },
  { community: "rounds", name: "ROUNDS", genre: "Action", limit: 1100 },
  { community: "bonelab", name: "BONELAB", genre: "Action", limit: 1000 },
  { community: "ultrakill", name: "ULTRAKILL", genre: "Action", limit: 1000 },
  { community: "dyson-sphere-program", name: "Dyson Sphere Program", genre: "Simulation", limit: 700 },
  { community: "shadows-of-doubt", name: "Shadows of Doubt", genre: "RPG", limit: 190 },
  { community: "subnautica-below-zero", name: "Subnautica: Below Zero", genre: "Survival", limit: 120 },
  { community: "subnautica", name: "Subnautica", genre: "Survival", limit: 110 },
  { community: "sons-of-the-forest", name: "Sons Of The Forest", genre: "Survival", limit: 80 },
  { community: "gamble-with-your-friends", name: "Gamble With Your Friends", genre: "Simulation", limit: 80 },
  { community: "windrose", name: "Windrose", genre: "Adventure", limit: 50 },
  { community: "burglin-gnomes", name: "Burglin' Gnomes", genre: "Action", limit: 50 },
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
  if (!raw) return "إضافات متنوعة";
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

async function runDiversification() {
  console.log("\n=======================================================");
  console.log("STARTING BROAD GAME DIVERSIFICATION (NEXUS STYLE)");
  console.log("=======================================================\n");

  for (const g of majorGames) {
    try {
      console.log(`\nFetching ${g.name} (${g.community})...`);
      const res = await fetch(`https://thunderstore.io/c/${g.community}/api/v1/package/`, {
        headers: { "User-Agent": "mode-library/1.0" }
      });
      if (!res.ok) {
        console.error(`Status ${res.status} for ${g.name}`);
        continue;
      }
      const pkgs = await res.json();
      const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0).slice(0, g.limit);
      console.log(`Processing ${valid.length} real mods for ${g.name}...`);

      const items = [];
      for (const pkg of valid) {
        const v = pkg.versions[0];
        const cleanName = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const slug = `${g.community}-${cleanName}`;
        const cat = translateCategory(pkg.categories?.[0]);
        const desc = v.description?.slice(0, 500) || pkg.name;
        const icon = v.icon || pkg.icon || null;
        const fileName = `${pkg.name}.zip`;

        items.push([
          pkg.name,
          slug,
          g.name,
          g.genre,
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

      const total = await getCount();
      console.log(`✓ Added ${items.length} mods for ${g.name} | Total Approved in DB: ${total}`);
    } catch (e) {
      console.error(`Error for ${g.name}:`, e.message);
    }
  }

  const finalTotal = await getCount();
  const distinctGames = await client.execute("SELECT COUNT(DISTINCT game) as g FROM mods WHERE status = 'approved'");
  console.log("\n=======================================================");
  console.log(`DIVERSIFICATION COMPLETE! TOTAL APPROVED MODS: ${finalTotal}`);
  console.log(`TOTAL DISTINCT GAMES: ${distinctGames.rows[0].g}`);
  console.log("=======================================================\n");
}

runDiversification().catch(console.error);
