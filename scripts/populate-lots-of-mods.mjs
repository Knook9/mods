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

// 1. استيراد مودات Minecraft الحقيقية مباشرة عبر Modrinth API
const minecraftProjects = [
  { slugId: "appleskin", title: "Appleskin", category: "أدوات", genre: "Sandbox", desc: "يعرض معلومات دقيقة ومفيدة للغاية عن مستوى الشبع وقيمة الطعام والجوع في واجهة ماينكرافت." },
  { slugId: "cloth-config", title: "Cloth Config API", category: "مكتبات مطلوبة", genre: "Sandbox", desc: "مكتبة إعدادات وتكوين متقدمة وشاملة يعتمد عليها عدد كبير من مودات Fabric و Forge." },
  { slugId: "ferrite-core", title: "FerriteCore", category: "تحسين الأداء", genre: "Sandbox", desc: "يقلل استهلاك ذاكرة الرام (RAM) في ماينكرافت بنسبة تصل إلى 50% دون التأثير على جودة اللعب." },
  { slugId: "modmenu", title: "Mod Menu", category: "واجهة المستخدم", genre: "Sandbox", desc: "يضيف زر قائمة المودات في الشاشة الرئيسية لتصفح وتعديل إعدادات المودات المثبتة بسهولة." },
  { slugId: "immediatelyfast", title: "ImmediatelyFast", category: "تحسين الأداء", genre: "Sandbox", desc: "تسريع عرض واجهة المستخدم والنصوص وتوليد الخرائط والشاشات بشكل فوري وسلس للغاية." },
  { slugId: "zoomify", title: "Zoomify", category: "أدوات", genre: "Adventure", desc: "مود تكبير وعدسة تقريب سينمائي قابل للتخصيص الكامل مع سلاسة وحركات انتقال فائقة النعومة." },
  { slugId: "entityculling", title: "Entity Culling", category: "تحسين الأداء", genre: "Sandbox", desc: "تخطي رندر ورسم الوحوش والكائنات والصناديق غير الظاهرة على الشاشة خلف الجدران لتوفير المعالجة." },
  { slugId: "dynamic-fps", title: "Dynamic FPS", category: "تحسين الأداء", genre: "Sandbox", desc: "يقلل استهلاك موارد المعالج وكرت الشاشة تلقائياً عندما تكون نافذة اللعبة في الخلفية أو مصغرة." },
  { slugId: "continuity", title: "Continuity", category: "الرسوميات", genre: "Sandbox", desc: "يدعم الزجاج المتصل والنوافذ الشفافة والملمس المتناسق بين الكتل المتجاورة بصورة رائعة." },
  { slugId: "visuality", title: "Visuality", category: "الرسوميات", genre: "Adventure", desc: "يضيف جزيئات ومؤثرات بصرية ساحرة عند الضرب والكسر وحركة الكائنات تحت الماء وفي الكهوف." },
  { slugId: "spark", title: "Spark Profiler", category: "أدوات", genre: "Sandbox", desc: "أداة فحص ومراقبة أداء دقيقة وخفيفة لتحليل استهلاك الموارد واكتشاف أسباب اللاغ في ماينكرافت." },
  { slugId: "waystones", title: "Waystones", category: "الاستكشاف", genre: "Adventure", desc: "يضيف أحجار ومسلات تنقل سحرية تتيح للاعبين الانتقال السريع بين القرى والقواعد حول العالم." }
];

async function addMinecraftMods() {
  console.log("Fetching Minecraft mods via Modrinth API...");
  for (const item of minecraftProjects) {
    try {
      const pRes = await fetch(`https://api.modrinth.com/v2/project/${item.slugId}`, { headers: { "User-Agent": "mode-library/1.0" } });
      if (!pRes.ok) {
        console.error(`Project ${item.slugId} failed: ${pRes.status}`);
        continue;
      }
      const pData = await pRes.json();
      const iconUrl = pData.icon_url;

      const vRes = await fetch(`https://api.modrinth.com/v2/project/${item.slugId}/version`, { headers: { "User-Agent": "mode-library/1.0" } });
      const vData = await vRes.json();
      const latest = vData[0];
      const primaryFile = latest?.files?.find(f => f.primary) ?? latest?.files?.[0];
      if (!primaryFile) continue;

      console.log(`Downloading ${item.title} v${latest.version_number}...`);
      const { storageKey, size } = await downloadAndHost(primaryFile.url, primaryFile.filename);

      const dbSlug = `minecraft-${item.slugId}`;
      const insertSql = `INSERT INTO mods (
        title, slug, game, game_genre, category, description,
        image_url, download_url, download_file_name, download_size,
        source_url, author, version, status, created_by,
        mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
      ) VALUES (?, ?, 'Minecraft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        image_url = excluded.image_url,
        version = excluded.version,
        mirror_storage_key = excluded.mirror_storage_key,
        mirror_file_name = excluded.mirror_file_name,
        mirror_size = excluded.mirror_size,
        mirror_uploaded_at = CURRENT_TIMESTAMP,
        status = 'approved'`;

      await client.execute({
        sql: insertSql,
        args: [
          item.title,
          dbSlug,
          item.genre,
          item.category,
          item.desc,
          iconUrl,
          primaryFile.url,
          primaryFile.filename,
          size,
          `https://modrinth.com/mod/${item.slugId}`,
          pData.team ? "Community" : "Author",
          latest.version_number,
          storageKey,
          primaryFile.filename,
          size
        ]
      });
      console.log(`Added ${item.title} ✓`);
    } catch (e) {
      console.error(`Failed ${item.title}:`, e.message);
    }
  }
}

// 2. استيراد مودات Valheim و Lethal Company الحقيقية من كاش Thunderstore
async function addThunderstoreMods() {
  console.log("\nFetching Thunderstore Valheim mods...");
  try {
    const valRes = await fetch("https://thunderstore.io/c/valheim/api/v1/package/", { headers: { "User-Agent": "mode-library/1.0" } });
    if (valRes.ok) {
      const data = await valRes.json();
      const targets = [
        { name: "Jotunn", title: "Jotunn (The Valheim Library)", category: "مكتبات مطلوبة", desc: "حزمة أدوات ومكتبة التطوير الأساسية لتعديل وإضافة أسلحة ودروع ووحوش مخصصة في عالم فالهيم." },
        { name: "CraftFromContainers", title: "Craft From Containers", category: "إدارة المخزون", desc: "اصنع وطوّر معداتك واطبخ باستخدام الموارد المخزنة داخل الصناديق القريبة دون حملها بيدك." },
        { name: "EquipmentAndQuickSlots", title: "Equipment and Quick Slots", category: "إدارة المخزون", desc: "يفصل الدروع والمعدات القابلة للارتداء في خانات خاصة مع 3 خانات وصول سريع للجرعات والطعام." },
        { name: "FarmGrid", title: "Farm Grid", category: "زراعة", desc: "يساعدك على زراعة المحاصيل والأشجار بتناسق وشبكة منتظمة لضمان نموها ومضاعفة المحصول." },
        { name: "BetterUI_Reforged", title: "Better UI Reforged", category: "واجهة المستخدم", desc: "تحسين كامل لواجهة اللعبة يضيف مستويات متانة واضحة، تفاصيل المهارات، وأشرطة صحة للأعداء." }
      ];

      for (const t of targets) {
        const pkg = data.find(p => p.name.toLowerCase() === t.name.toLowerCase());
        if (pkg && pkg.versions?.[0]) {
          const v = pkg.versions[0];
          console.log(`Downloading ${t.title} v${v.version_number}...`);
          const fileName = `${pkg.name}.zip`;
          const { storageKey, size } = await downloadAndHost(v.download_url, fileName);
          const dbSlug = `valheim-${pkg.name.toLowerCase()}`;

          await client.execute({
            sql: `INSERT INTO mods (
              title, slug, game, game_genre, category, description,
              image_url, download_url, download_file_name, download_size,
              source_url, author, version, status, created_by,
              mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
            ) VALUES (?, ?, 'Valheim', 'Survival', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(slug) DO UPDATE SET
              title = excluded.title,
              image_url = excluded.image_url,
              mirror_storage_key = excluded.mirror_storage_key,
              mirror_file_name = excluded.mirror_file_name,
              mirror_size = excluded.mirror_size,
              mirror_uploaded_at = CURRENT_TIMESTAMP,
              status = 'approved'`,
            args: [
              t.title,
              dbSlug,
              t.category,
              t.desc,
              v.icon || pkg.icon,
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
          console.log(`Added ${t.title} ✓`);
        }
      }
    }
  } catch (err) {
    console.error("Valheim Thunderstore error:", err.message);
  }

  console.log("\nFetching Thunderstore Lethal Company mods...");
  try {
    const lcRes = await fetch("https://thunderstore.io/c/lethal-company/api/v1/package/", { headers: { "User-Agent": "mode-library/1.0" } });
    if (lcRes.ok) {
      const data = await lcRes.json();
      const targets = [
        { name: "LateCompany", title: "LateCompany", category: "لعب جماعي", desc: "يسمح للاعبين بالانضمام إلى السيرفر والردهة حتى بعد بدء الجولة دون الحاجة لإعادة إنشاء الغرفة." },
        { name: "Helmet_Cameras", title: "Helmet Cameras", category: "أدوات", desc: "يضيف شاشة مراقبة حية إضافية داخل السفينة تعرض ما يراه زملاؤك عبر كاميرات مثبتة على خوذهم." },
        { name: "ReservedWalkieSlot", title: "Reserved Walkie Slot", category: "إدارة المخزون", desc: "يضيف خانة مخصصة لجهاز اللاسلكي (Walkie Talkie) مع زر تحدث خاص وتوفير مساحة الحمل." },
        { name: "Mimics", title: "Mimics", category: "أعداء ومخاطر", desc: "يضيف أبواباً مقلدة مفترسة تخدع اللاعبين وتلتهم من يحاول فتحها بغير حذر." },
        { name: "FasterItemDropship", title: "Faster Item Dropship", category: "تحسينات اللعب", desc: "يسرع وصول مركبة توصيل الأغراض المشتراة لتهبط وتغادر في وقت قياسي." }
      ];

      for (const t of targets) {
        const pkg = data.find(p => p.name.toLowerCase() === t.name.toLowerCase());
        if (pkg && pkg.versions?.[0]) {
          const v = pkg.versions[0];
          console.log(`Downloading ${t.title} v${v.version_number}...`);
          const fileName = `${pkg.name}.zip`;
          const { storageKey, size } = await downloadAndHost(v.download_url, fileName);
          const dbSlug = `lethal-company-${pkg.name.toLowerCase()}`;

          await client.execute({
            sql: `INSERT INTO mods (
              title, slug, game, game_genre, category, description,
              image_url, download_url, download_file_name, download_size,
              source_url, author, version, status, created_by,
              mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
            ) VALUES (?, ?, 'Lethal Company', 'Horror', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(slug) DO UPDATE SET
              title = excluded.title,
              image_url = excluded.image_url,
              mirror_storage_key = excluded.mirror_storage_key,
              mirror_file_name = excluded.mirror_file_name,
              mirror_size = excluded.mirror_size,
              mirror_uploaded_at = CURRENT_TIMESTAMP,
              status = 'approved'`,
            args: [
              t.title,
              dbSlug,
              t.category,
              t.desc,
              v.icon || pkg.icon,
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
          console.log(`Added ${t.title} ✓`);
        }
      }
    }
  } catch (err) {
    console.error("Lethal Company Thunderstore error:", err.message);
  }
}

async function run() {
  await addMinecraftMods();
  await addThunderstoreMods();

  const res = await client.execute("SELECT COUNT(*) as c FROM mods WHERE status='approved' AND mirror_storage_key IS NOT NULL");
  console.log(`\n========================================`);
  console.log(`TOTAL REAL SELF-HOSTED MODS WITH ICONS: ${res.rows[0].c}`);
  console.log(`========================================\n`);
}

run().catch(console.error);
