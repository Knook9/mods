import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const TARGET_MODS = 896948;
const TARGET_GAMES = 5644;

const genres = ["Action", "RPG", "Adventure", "Simulation", "Strategy", "Survival", "Horror", "Roguelike", "Sandbox"];

const modTemplates = [
  { prefix: "Ultra HD Textures", cat: "الرسوميات والتظليل", desc: "ترقية وتحسين خامات ورسوميات اللعبة إلى دقة فائقة 4K مع الحفاظ على الأداء." },
  { prefix: "Extended Inventory Overhaul", cat: "إدارة المخزون", desc: "توسيع وترتيب حقيبة المخزون مع فلاتر سريعة وتصنيف العناصر تلقائياً." },
  { prefix: "Enhanced Combat & Weapons", cat: "أسلحة ومعدات", desc: "إضافة أسلحة متطورة وتعديل ميكانيكيات القتال لتصبح أكثر واقعية واستجابة." },
  { prefix: "Fast Loading & FPS Boost", cat: "تحسين الأداء", desc: "تحسين أوقات التحميل ومضاعفة معدل الإطارات واستقرار محرك اللعبة." },
  { prefix: "Custom Modern UI Theme", cat: "واجهة المستخدم", desc: "إعادة تصميم واجهة المستخدم والقوائم بأسلوب حديث وأنيق وواضح." },
  { prefix: "New Maps & Dungeons Expansion", cat: "خرائط وعوالم جديدة", desc: "توسعة ضخمة تضيف مناطق وعوالم وزنزانات جديدة مليئة بالأسرار والتحديات." },
  { prefix: "Quality of Life Tweaks", cat: "تحسينات اللعب", desc: "تعديلات مريحة تسهل تجربة اللعب اليومية وتختصر المهام المتكررة." },
  { prefix: "Realistic Lighting & Shaders", cat: "الرسوميات والتظليل", desc: "نظام إضاءة وظلال واقعية وانعكاسات ضوئية سينمائية تخطف الأنفاس." },
  { prefix: "Legendary Armor & Outfits", cat: "أزياء وتجميل", desc: "مجموعة دروع وأزياء أسطورية فريدة قابلة للتخصيص والتطوير." },
  { prefix: "Immersive Audio & Soundtrack", cat: "صوتيات وموسيقى", desc: "مؤثرات صوتية محيطية ثلاثية الأبعاد وموسيقى تصويرية جديدة كلياً." },
  { prefix: "Essential Script Extender", cat: "مكتبات مطلوبة", desc: "أداة ومكتبة تشغيل برمجية أساسية تدعم تشغيل الإضافات وتحديثات السكربتات." },
  { prefix: "Quick Companion & NPC System", cat: "شخصيات جديدة", desc: "إضافة رفقاء وشخصيات ذكية ترافقك في المغامرة وتساعدك في القتال." },
  { prefix: "Hardcore Survival Mode", cat: "تحسينات اللعب", desc: "طور لعب ملحمي يضيف عناصر الجوع والعطش والطقس القاسي لرفع مستوى التحدي." },
  { prefix: "Fast Travel & Waypoints", cat: "أدوات ومساعدات", desc: "نقاط انتقال سريعة وقابلة للإنشاء لتسهيل السفر والتنقل في العالم المفتوح." },
  { prefix: "Dynamic Weather & Seasons", cat: "الرسوميات والتظليل", desc: "نظام طقس وفصول ديناميكي واقعي يغير البيئة والتضاريس مع مرور الوقت." },
  { prefix: "Expanded Magic & Skill Tree", cat: "تحسينات اللعب", desc: "شجرة مهارات وقدرات سحرية عميقة تتيح بناء شخصيات بأساليب لعب لا حصر لها." }
];

async function executeWithRetry(sql, args, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.execute({ sql, args });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = attempt * 2000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function runResilientGeneration() {
  const currentCountRes = await executeWithRetry("SELECT COUNT(*) as c FROM mods WHERE status='approved'", []);
  const currentGamesRes = await executeWithRetry("SELECT COUNT(DISTINCT game) as g FROM mods WHERE status='approved'", []);
  let totalInserted = Number(currentCountRes.rows[0].c);
  let startIdx = Number(currentGamesRes.rows[0].g);

  console.log(`Resuming ingestion with auto-retry from game index ${startIdx} (Current Mods: ${totalInserted})...`);

  const res = await fetch("https://raw.githubusercontent.com/dgibbs64/SteamCMD-AppID-List/master/steamcmd_appid.json");
  const data = await res.json();
  const allApps = data.applist.apps;

  const validGames = [];
  const seen = new Set();

  for (const app of allApps) {
    const name = app.name?.trim();
    if (!name || name.length < 3 || name.length > 50) continue;
    if (name.includes("Dedicated Server") || name.includes("Soundtrack") || name.includes("Trailer") || name.includes("Demo") || name.includes("Beta") || name.includes("SDK")) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    validGames.push(name);
    if (validGames.length >= TARGET_GAMES) break;
  }

  const modsPerGame = Math.ceil(TARGET_MODS / validGames.length);
  let batch = [];

  for (let gIdx = startIdx; gIdx < validGames.length; gIdx++) {
    if (totalInserted >= TARGET_MODS) break;
    const gameName = validGames[gIdx];
    const gameGenre = genres[gIdx % genres.length];

    for (let mIdx = 0; mIdx < modsPerGame; mIdx++) {
      if (totalInserted >= TARGET_MODS) break;

      const tmpl = modTemplates[mIdx % modTemplates.length];
      const verMajor = 1 + Math.floor(mIdx / 16);
      const verMinor = (mIdx % 16);
      const version = `${verMajor}.${verMinor}`;
      const title = `${tmpl.prefix} v${version}`;
      const slug = `${gameName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-mod-${mIdx + 1}`.slice(0, 80);
      const desc = `${tmpl.desc} مصمم خصيصاً ومجرب للعبة ${gameName}.`;
      const fileName = `${gameName.replace(/[^a-zA-Z0-9]/g, "")}_Mod_${mIdx + 1}.zip`;
      const dlUrl = `https://download.gamemods.org/${encodeURIComponent(slug)}/${fileName}`;

      batch.push([
        title, slug, gameName, gameGenre, tmpl.cat, desc, null, dlUrl, fileName,
        (1024 * 1024 * (1 + (mIdx % 20))), "Community Team", version
      ]);

      if (batch.length >= 60) {
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
        const args = batch.flat();
        const sql = `INSERT OR IGNORE INTO mods (
          title, slug, game, game_genre, category, description,
          image_url, download_url, download_file_name, download_size,
          author, version, status, created_by
        ) VALUES ${placeholders.join(", ")}`;

        await executeWithRetry(sql, args);
        totalInserted += batch.length;
        batch = [];

        if (totalInserted % 20000 === 0) {
          console.log(`[Progress Update] Total: ${totalInserted} / ${TARGET_MODS} | Game: ${gIdx + 1} / ${TARGET_GAMES}`);
        }
      }
    }
  }

  if (batch.length > 0) {
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')");
    const args = batch.flat();
    const sql = `INSERT OR IGNORE INTO mods (
      title, slug, game, game_genre, category, description,
      image_url, download_url, download_file_name, download_size,
      author, version, status, created_by
    ) VALUES ${placeholders.join(", ")}`;
    await executeWithRetry(sql, args);
    totalInserted += batch.length;
  }

  console.log(`\nTARGET COMPLETE! Total mods in Turso: ${totalInserted}`);
}

runResilientGeneration().catch(console.error);
