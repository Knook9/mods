import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

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
  food: "طعام وزراعة"
};

function translateCategory(raw) {
  if (!raw) return "أدوات";
  const r = String(raw).toLowerCase();
  for (const [k, v] of Object.entries(categoryMap)) {
    if (r.includes(k)) return v;
  }
  return "أدوات";
}

async function importModrinthMassive(targetTotal = 8000) {
  console.log(`\nImporting up to ${targetTotal} mods from Modrinth...`);
  let imported = 0;
  for (let offset = 0; offset < targetTotal; offset += 100) {
    try {
      const url = `https://api.modrinth.com/v2/search?limit=100&offset=${offset}&index=downloads&facets=[["project_type:mod"]]`;
      const res = await fetch(url, { headers: { "User-Agent": "mode-library/1.0" } });
      if (!res.ok) {
        console.error(`Modrinth fetch error at offset ${offset}: ${res.status}`);
        break;
      }
      const data = await res.json();
      if (!data.hits || data.hits.length === 0) break;

      const items = [];
      for (const hit of data.hits) {
        const slug = `minecraft-${hit.slug}`;
        const cat = translateCategory(hit.categories?.[0]);
        const desc = hit.description?.slice(0, 500) || hit.title;
        const icon = hit.icon_url || null;
        const fileName = `${hit.slug}.jar`;
        const downloadUrl = `https://modrinth.com/mod/${hit.slug}`;

        items.push([
          hit.title,
          slug,
          cat,
          desc,
          icon,
          downloadUrl,
          fileName,
          downloadUrl,
          hit.author || "Community",
          hit.latest_version || "1.0"
        ]);
      }

      // الدخول دفعات صغيرة كل دفعة 25 عنصر
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const placeholders = chunk.map(() => "(?, ?, 'Minecraft', 'Sandbox', ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
        const args = chunk.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name,
          source_url, author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;
        await client.execute({ sql, args });
      }

      imported += data.hits.length;
      console.log(`[Modrinth Progress] Stored ${imported} mods (Offset: ${offset})...`);
    } catch (e) {
      console.error(`Error at offset ${offset}:`, e.message);
    }
  }
}

async function main() {
  await importModrinthMassive(8000);

  const res = await client.execute("SELECT COUNT(*) as c FROM mods WHERE status = 'approved'");
  const gamesRes = await client.execute("SELECT COUNT(DISTINCT game) as games FROM mods WHERE status = 'approved'");
  console.log("\n=======================================================");
  console.log(`TOTAL APPROVED REAL MODS IN TURSO: ${res.rows[0].c}`);
  console.log(`TOTAL GAMES IN TURSO: ${gamesRes.rows[0].games}`);
  console.log("=======================================================\n");
}

main().catch(console.error);
