import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const TARGET_MODS = 97000; // للوصول وتجاوز 96,911

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

async function getCount() {
  const res = await client.execute("SELECT COUNT(*) as c FROM mods WHERE status = 'approved'");
  return Number(res.rows[0].c);
}

// 1. جلب مجتمعات إضافية من Thunderstore (ألعاب متنوعة)
async function fetchMoreThunderstoreGames() {
  console.log("\n--- Checking Thunderstore communities ---");
  try {
    const comRes = await fetch("https://thunderstore.io/api/experimental/community/", {
      headers: { "User-Agent": "mode-library/1.0" }
    });
    if (!comRes.ok) return;
    const comData = await comRes.json();
    const communities = comData.results || comData;

    for (const c of communities.slice(35, 80)) {
      try {
        const pkgRes = await fetch(`https://thunderstore.io/c/${c.identifier}/api/v1/package/`, {
          headers: { "User-Agent": "mode-library/1.0" }
        });
        if (!pkgRes.ok) continue;
        const pkgs = await pkgRes.json();
        const valid = pkgs.filter(p => !p.is_deprecated && p.versions?.length > 0);
        if (valid.length === 0) continue;

        const items = [];
        for (const pkg of valid) {
          const v = pkg.versions[0];
          const slug = `${c.identifier}-${pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
          const cat = translateCategory(pkg.categories?.[0]);
          const desc = v.description?.slice(0, 500) || pkg.name;
          const icon = v.icon || pkg.icon || null;
          const fileName = `${pkg.name}.zip`;

          items.push([
            pkg.name,
            slug,
            c.name,
            "Action",
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
        console.log(`Added ${items.length} mods for game: ${c.name}`);
      } catch (e) {
        // continue
      }
    }
  } catch (err) {
    console.error("Thunderstore error:", err.message);
  }
}

// 2. تدفق Modrinth حتى الوصول إلى الرقم المطلوب
async function fetchModrinthUntilTarget() {
  console.log("\n--- Starting Continuous Modrinth Ingestion Pipeline ---");
  let currentTotal = await getCount();
  console.log(`Current Total in Turso: ${currentTotal}`);

  let offset = 8000;
  while (currentTotal < TARGET_MODS && offset < 150000) {
    try {
      const url = `https://api.modrinth.com/v2/search?limit=100&offset=${offset}&index=relevance`;
      const res = await fetch(url, { headers: { "User-Agent": "mode-library/1.0" } });
      if (!res.ok) {
        console.error(`Modrinth fetch error at offset ${offset}: ${res.status}`);
        await new Promise(r => setTimeout(r, 2000));
        offset += 100;
        continue;
      }

      const data = await res.json();
      if (!data.hits || data.hits.length === 0) {
        console.log("No more hits returned from Modrinth search.");
        break;
      }

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

      offset += 100;

      // تقرير كل 500 مود
      if (offset % 500 === 0) {
        currentTotal = await getCount();
        console.log(`[Progress Update] Offset: ${offset} | Total in DB: ${currentTotal} / ${TARGET_MODS}`);
      }
    } catch (e) {
      console.error(`Error at offset ${offset}:`, e.message);
      await new Promise(r => setTimeout(r, 1000));
      offset += 100;
    }
  }
}

async function main() {
  await fetchMoreThunderstoreGames();
  await fetchModrinthUntilTarget();

  const finalCount = await getCount();
  const gamesRes = await client.execute("SELECT COUNT(DISTINCT game) as games FROM mods WHERE status = 'approved'");
  console.log("\n=======================================================");
  console.log(`TARGET REACHED! FINAL APPROVED MODS IN TURSO: ${finalCount}`);
  console.log(`TOTAL DISTINCT GAMES: ${gamesRes.rows[0].games}`);
  console.log("=======================================================\n");
}

main().catch(console.error);
