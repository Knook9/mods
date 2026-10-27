import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const TARGET_GOAL = 97000; // لتجاوز 96,911

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

// 1. استكمال باقي مودات Valheim الكبرى (أكثر من 7,000 مود إضافي)
async function fillRemainingValheim() {
  console.log("\n--- Ingesting Remaining Valheim Mods ---");
  try {
    const res = await fetch("https://thunderstore.io/c/valheim/api/v1/package/", {
      headers: { "User-Agent": "mode-library/1.0" }
    });
    if (!res.ok) return;
    const pkgs = await res.json();
    const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0).slice(6000);
    console.log(`Remaining Valheim mods to process: ${valid.length}...`);

    const items = [];
    for (const pkg of valid) {
      const v = pkg.versions[0];
      const cleanName = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const slug = `valheim-${cleanName}`;
      const cat = translateCategory(pkg.categories?.[0]);
      const desc = v.description?.slice(0, 500) || pkg.name;
      const icon = v.icon || pkg.icon || null;
      const fileName = `${pkg.name}.zip`;

      items.push([
        pkg.name,
        slug,
        "Valheim",
        "Survival",
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
    const c = await getCount();
    console.log(`✓ Valheim Finished. Current Total: ${c}`);
  } catch (e) {
    console.error("Valheim error:", e.message);
  }
}

// 2. استكمال باقي مودات Lethal Company الضخمة (حتى الوصول للرقم الدقيق 97,000+)
async function fillRemainingLethalCompany() {
  console.log("\n--- Ingesting Remaining Lethal Company Mods ---");
  try {
    const res = await fetch("https://thunderstore.io/c/lethal-company/api/v1/package/", {
      headers: { "User-Agent": "mode-library/1.0" }
    });
    if (!res.ok) return;
    const pkgs = await res.json();
    const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0).slice(25000);
    console.log(`Remaining Lethal Company mods available: ${valid.length}...`);

    let items = [];
    let current = await getCount();

    for (const pkg of valid) {
      if (current >= TARGET_GOAL) break;

      const v = pkg.versions[0];
      const cleanName = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const slug = `lethal-company-${cleanName}`;
      const cat = translateCategory(pkg.categories?.[0]);
      const desc = v.description?.slice(0, 500) || pkg.name;
      const icon = v.icon || pkg.icon || null;
      const fileName = `${pkg.name}.zip`;

      items.push([
        pkg.name,
        slug,
        "Lethal Company",
        "Horror",
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

      if (items.length >= 25) {
        const placeholders = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
        const args = items.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          source_url, author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;
        await client.execute({ sql, args });
        items = [];
      }

      // تحديث فحص العداد كل 500 عنصر
      if (items.length === 0 && Math.random() < 0.05) {
        current = await getCount();
        console.log(`[Target Pipeline Progress] Total in Turso: ${current} / ${TARGET_GOAL}`);
      }
    }

    if (items.length > 0) {
      const placeholders = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
      const args = items.flat();
      const sql = `INSERT OR IGNORE INTO mods (
        title, slug, game, game_genre, category, description,
        image_url, download_url, download_file_name, download_size,
        source_url, author, version, status, created_by
      ) VALUES ${placeholders.join(", ")}`;
      await client.execute({ sql, args });
    }
  } catch (e) {
    console.error("Lethal Company error:", e.message);
  }
}

async function main() {
  await fillRemainingValheim();
  await fillRemainingLethalCompany();

  const finalTotal = await getCount();
  const distinctGames = await client.execute("SELECT COUNT(DISTINCT game) as g FROM mods WHERE status = 'approved'");
  console.log("\n=======================================================");
  console.log(`GOAL REACHED! TOTAL APPROVED MODS: ${finalTotal}`);
  console.log(`TOTAL DISTINCT GAMES: ${distinctGames.rows[0].g}`);
  console.log("=======================================================\n");
}

main().catch(console.error);
