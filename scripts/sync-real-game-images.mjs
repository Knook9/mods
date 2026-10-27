import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

async function withRetry(fn, maxRetries = 8) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 2000 * attempt;
      console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms... (${err.message?.slice(0, 60)})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function syncRealGameImages() {
  console.log("Fetching official Steam App list...");
  const res = await fetch("https://raw.githubusercontent.com/dgibbs64/SteamCMD-AppID-List/master/steamcmd_appid.json");
  const data = await res.json();
  const allApps = data.applist.apps;

  // Build a name -> appid map
  const appMap = new Map();
  for (const app of allApps) {
    if (app.name && !appMap.has(app.name)) {
      appMap.set(app.name, app.appid);
    }
  }

  // Build batch UPDATE statements PER GAME using the app map
  // This avoids slow SELECT DISTINCT on a 900K row table
  // We already know the 5644 game names from the Steam catalog used during seeding
  const validGames = [];
  const seen = new Set();
  for (const app of allApps) {
    const name = app.name?.trim();
    if (!name || name.length < 3 || name.length > 50) continue;
    if (name.includes("Dedicated Server") || name.includes("Soundtrack") || name.includes("Trailer") || name.includes("Demo") || name.includes("Beta") || name.includes("SDK")) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    validGames.push({ name, appid: app.appid });
    if (validGames.length >= 5644) break;
  }

  console.log(`Processing ${validGames.length} games from Steam catalog...`);

  // Only update games whose mods don't already have Steam images
  // We do this by checking which game names still appear with non-Steam image_url
  // Use a lighter query: get games that need updating
  console.log("Checking which games already have Steam images...");
  const alreadyDone = await withRetry(() =>
    client.execute("SELECT DISTINCT game FROM mods WHERE image_url LIKE '%steamstatic.com%' LIMIT 5000")
  );
  const doneSet = new Set(alreadyDone.rows.map(r => String(r.game)));
  console.log(`${doneSet.size} games already have Steam images, skipping them.`);

  const toUpdate = validGames.filter(g => !doneSet.has(g.name));
  console.log(`Need to update ${toUpdate.length} remaining games.`);

  let updated = 0;
  let missing = 0;
  const fallback = "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80";

  for (let i = 0; i < toUpdate.length; i++) {
    const { name, appid } = toUpdate[i];
    const imageUrl = appid
      ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`
      : fallback;

    await withRetry(() =>
      client.execute({
        sql: "UPDATE mods SET image_url = ? WHERE game = ?",
        args: [imageUrl, name]
      })
    );

    if (appid) updated++;
    else missing++;

    // Pause every 200 games to be gentle on Turso
    if (i > 0 && i % 200 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }

    if ((i + 1) % 300 === 0 || i === toUpdate.length - 1) {
      console.log(`Progress: ${i + 1} / ${toUpdate.length} | Steam images: ${updated} | Fallback: ${missing}`);
    }
  }

  console.log(`\n🎉 DONE! All ${updated + missing} remaining games processed. ${updated} with real Steam images!`);
}

syncRealGameImages().catch(console.error);
