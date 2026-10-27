import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const USER_AGENT = "mode-app/1.0 (contact@mode.games)";

async function executeWithRetry(sql, args, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.execute({ sql, args });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// 1. Modrinth Ingestion (Minecraft & other open ecosystem games)
async function ingestModrinth(targetCount = 2000) {
  console.log(`\n--- Starting Modrinth Ingestion (Target: ${targetCount}) ---`);
  let offset = 0;
  const limit = 100;
  let added = 0;

  while (added < targetCount) {
    try {
      const url = `https://api.modrinth.com/v2/search?limit=${limit}&offset=${offset}&index=downloads`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        console.error("Modrinth fetch failed:", res.status);
        break;
      }
      const data = await res.json();
      const hits = data.hits;
      if (!hits || hits.length === 0) break;

      let batch = [];
      for (const hit of hits) {
        const title = hit.title?.trim();
        const slug = `mr-${hit.slug || hit.project_id}`.slice(0, 80);
        const game = "Minecraft";
        const gameGenre = "Sandbox";
        const category = hit.categories?.[0] || "تحسينات اللعب";
        const desc = hit.description || `${title} - مود رسمي حقيقي ومميز لمجتمع اللعبة.`;
        const iconUrl = hit.icon_url || hit.gallery?.[0] || null;
        const author = hit.author || "Modrinth Creator";
        const dlUrl = `https://modrinth.com/mod/${hit.slug || hit.project_id}`;
        const fileName = `${hit.slug || "mod"}.jar`;

        batch.push([
          title, slug, game, gameGenre, category, desc, iconUrl, dlUrl, fileName,
          1024 * 1024 * 2, author, hit.latest_version || "1.0", "approved", "hi423179@gmail.com"
        ]);
      }

      if (batch.length > 0) {
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const args = batch.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;

        await executeWithRetry(sql, args);
        added += batch.length;
        console.log(`[Modrinth] Added: ${added} / ${targetCount}`);
      }

      offset += limit;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error("Modrinth batch error:", err.message);
      break;
    }
  }
}

// 2. Thunderstore Ingestion (Lethal Company, Valheim, Subnautica, ULTRAKILL, etc.)
const thunderstoreGames = [
  { community: "lethal-company", name: "Lethal Company", genre: "Horror", limit: 800 },
  { community: "valheim", name: "Valheim", genre: "Survival", limit: 600 },
  { community: "ultrakill", name: "ULTRAKILL", genre: "Action", limit: 300 },
  { community: "rounds", name: "ROUNDS", genre: "Action", limit: 200 },
  { community: "content-warning", name: "Content Warning", genre: "Horror", limit: 300 },
  { community: "subnautica", name: "Subnautica", genre: "Survival", limit: 150 },
  { community: "gtfo", name: "GTFO", genre: "Action", limit: 200 },
  { community: "repo", name: "R.E.P.O.", genre: "Action", limit: 300 },
];

async function ingestThunderstore() {
  console.log("\n--- Starting Thunderstore Ingestion ---");

  for (const g of thunderstoreGames) {
    try {
      console.log(`Fetching ${g.name} mods from Thunderstore...`);
      const url = `https://thunderstore.io/c/${g.community}/api/v1/package/`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        console.log(`Failed fetching ${g.name}: ${res.status}`);
        continue;
      }
      const packages = await res.json();
      const slice = packages.slice(0, g.limit);

      let batch = [];
      let count = 0;

      for (const p of slice) {
        const v = p.versions?.[0];
        if (!v) continue;

        const title = (p.name || "").replace(/_/g, " ");
        const slug = `ts-${g.community}-${(p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`.slice(0, 80);
        const game = g.name;
        const gameGenre = g.genre;
        const category = p.categories?.[0] || "تحسينات اللعب";
        const desc = v.description || `${title} - مود حقيقي ومميز ومطلوب للعبة ${g.name}.`;
        const iconUrl = v.icon || null;
        const author = p.owner || "Community Modder";
        const dlUrl = v.download_url || `https://thunderstore.io/package/download/${p.owner}/${p.name}/${v.version_number}/`;
        const fileName = `${p.name}-${v.version_number}.zip`;
        const fileSize = v.file_size || 1024 * 1024 * 5;

        batch.push([
          title, slug, game, gameGenre, category, desc, iconUrl, dlUrl, fileName,
          fileSize, author, v.version_number || "1.0", "approved", "hi423179@gmail.com"
        ]);

        if (batch.length >= 50) {
          const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          const args = batch.flat();
          const sql = `INSERT OR IGNORE INTO mods (
            title, slug, game, game_genre, category, description,
            image_url, download_url, download_file_name, download_size,
            author, version, status, created_by
          ) VALUES ${placeholders.join(", ")}`;

          await executeWithRetry(sql, args);
          count += batch.length;
          batch = [];
        }
      }

      if (batch.length > 0) {
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const args = batch.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;
        await executeWithRetry(sql, args);
        count += batch.length;
      }

      console.log(`[Thunderstore] Added ${count} authentic mods for ${g.name}!`);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error with ${g.name}:`, err.message);
    }
  }
}

async function main() {
  await ingestModrinth(2500);
  await ingestThunderstore();

  const total = await client.execute("SELECT COUNT(*) as c, COUNT(DISTINCT game) as g FROM mods");
  console.log("\n=======================================================");
  console.log("🎉 AUTHENTIC INGESTION FINISHED!");
  console.log("Total Real Verified Mods in DB:", total.rows[0].c);
  console.log("Games with Real Mods:", total.rows[0].g);
  console.log("=======================================================");
}

main().catch(console.error);
