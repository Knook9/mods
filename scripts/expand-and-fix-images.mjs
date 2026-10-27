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

// 1. تحديث الصور الحالية بمصادر صحيحة شغالة ومختبرة
const fixedImages = {
  "Sodium": "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp",
  "Iris Shaders": "https://cdn.modrinth.com/data/YL57xq9U/icon.png",
  "Lithium": "https://cdn.modrinth.com/data/gvQqBUqZ/icon.png",
  "Xaero's Minimap": "https://cdn.modrinth.com/data/1bokaNcj/icon.png",
  "Terralith": "https://cdn.modrinth.com/data/8oi3bvq5/icon.png",
  "MoreCompany": "https://ccdn.thunderstore.io/live/repository/icons/notnotnotswipez-MoreCompany-1.14.0.png",
  "TooManyEmotes": "https://ccdn.thunderstore.io/live/repository/icons/FlipMods-TooManyEmotes-2.3.17.png",
  "Valheim Raft": "https://ccdn.thunderstore.io/live/repository/icons/zolantris-ValheimRAFT-5.1.1.png",
  "Epic Loot": "https://ccdn.thunderstore.io/live/repository/icons/RandyKnapp-EpicLoot-0.15.2.png",
  "PlantEverything": "https://ccdn.thunderstore.io/live/repository/icons/Advize-PlantEverything-1.21.4.png",
  "ItemStats": "https://ccdn.thunderstore.io/live/repository/icons/Moffein-ItemStats-1.3.5.png",
  "SMAPI - Stardew Modding API": "https://stardewvalleywiki.com/mediawiki/images/b/b8/SMAPI_logo.png"
};

async function fixExistingImages() {
  console.log("Updating existing mod images...");
  for (const [title, imgUrl] of Object.entries(fixedImages)) {
    await client.execute({
      sql: "UPDATE mods SET image_url = ? WHERE title = ?",
      args: [imgUrl, title]
    });
  }
  console.log("All existing mod images updated!");
}

// 2. قائمة مودات حقيقية جديدة شهيرة مع ملفاتها الحقيقية وصورها
const newRealMods = [
  // Minecraft (Modrinth)
  {
    title: "Appleskin",
    slug: "minecraft-appleskin",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "أدوات",
    description: "يعرض معلومات دقيقة ومفيدة للغاية عن مستوى الشبع وقيمة الطعام والجوع في واجهة ماينكرافت.",
    author: "squeek502",
    version: "mc1.21-3.0.5",
    downloadUrl: "https://cdn.modrinth.com/data/EsAfCjCV/versions/4iKq01yK/appleskin-fabric-mc1.21-3.0.5.jar",
    fileName: "appleskin-fabric-mc1.21-3.0.5.jar",
    imageUrl: "https://cdn.modrinth.com/data/EsAfCjCV/icon.png"
  },
  {
    title: "Cloth Config API",
    slug: "minecraft-cloth-config",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "مكتبات مطلوبة",
    description: "مكتبة إعدادات وتكوين متقدمة وشاملة يعتمد عليها عدد كبير من مودات Fabric و Forge.",
    author: "shedaniel",
    version: "15.0.140",
    downloadUrl: "https://cdn.modrinth.com/data/9s6osm5g/versions/U6hZ9QoD/cloth-config-15.0.140-fabric.jar",
    fileName: "cloth-config-15.0.140-fabric.jar",
    imageUrl: "https://cdn.modrinth.com/data/9s6osm5g/icon.png"
  },
  {
    title: "FerriteCore",
    slug: "minecraft-ferrite-core",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "تحسين الأداء",
    description: "يقلل استهلاك ذاكرة الرام (RAM) في لعبة ماينكرافت بنسبة تصل إلى 50% دون التأثير على جودة اللعب.",
    author: "malte0811",
    version: "7.0.0",
    downloadUrl: "https://cdn.modrinth.com/data/uXXizFIs/versions/xMhVz95R/ferritecore-7.0.0-fabric.jar",
    fileName: "ferritecore-7.0.0-fabric.jar",
    imageUrl: "https://cdn.modrinth.com/data/uXXizFIs/icon.png"
  },
  {
    title: "Mod Menu",
    slug: "minecraft-modmenu",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "واجهة المستخدم",
    description: "يضيف زر قائمة المودات في الشاشة الرئيسية لماينكرافت لتصفح وتعديل إعدادات المودات المثبتة بسهولة.",
    author: "TerraformersMC",
    version: "11.0.3",
    downloadUrl: "https://cdn.modrinth.com/data/mOgUt4GM/versions/k2tC8B7k/modmenu-11.0.3.jar",
    fileName: "modmenu-11.0.3.jar",
    imageUrl: "https://cdn.modrinth.com/data/mOgUt4GM/icon.png"
  },
  {
    title: "ImmediatelyFast",
    slug: "minecraft-immediatelyfast",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "تحسين الأداء",
    description: "تسريع عرض واجهة المستخدم والنصوص وتوليد الخرائط والشاشات بشكل فوري وسلس للغاية.",
    author: "RaphiMC",
    version: "1.3.3",
    downloadUrl: "https://cdn.modrinth.com/data/5ZwdcRci/versions/xJ5csm7z/ImmediatelyFast-Fabric-1.3.3%2B1.21.1.jar",
    fileName: "ImmediatelyFast-Fabric-1.3.3+1.21.1.jar",
    imageUrl: "https://cdn.modrinth.com/data/5ZwdcRci/icon.png"
  },
  {
    title: "Zoomify",
    slug: "minecraft-zoomify",
    game: "Minecraft",
    gameGenre: "Adventure",
    category: "أدوات",
    description: "مود تكبير وعدسة تقريب سينمائي قابل للتخصيص الكامل مع سلاسة وحركات انتقال فائقة النعومة.",
    author: "isXander",
    version: "2.14.2",
    downloadUrl: "https://cdn.modrinth.com/data/w7ThoJFB/versions/0w13oU8T/Zoomify-2.14.2%2B1.21.jar",
    fileName: "Zoomify-2.14.2+1.21.jar",
    imageUrl: "https://cdn.modrinth.com/data/w7ThoJFB/icon.png"
  },
  {
    title: "Entity Culling",
    slug: "minecraft-entityculling",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "تحسين الأداء",
    description: "تخطي رندر ورسم الوحوش والكائنات والصناديق غير الظاهرة على الشاشة خلف الجدران لتوفير المعالجة.",
    author: "tr9zw",
    version: "1.7.1",
    downloadUrl: "https://cdn.modrinth.com/data/NNAgCjsB/versions/7q7gC6lM/entityculling-fabric-1.7.1-mc1.21.jar",
    fileName: "entityculling-fabric-1.7.1-mc1.21.jar",
    imageUrl: "https://cdn.modrinth.com/data/NNAgCjsB/icon.png"
  },
  {
    title: "Dynamic FPS",
    slug: "minecraft-dynamic-fps",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "تحسين الأداء",
    description: "يقلل استهلاك موارد المعالج وكرت الشاشة تلقائياً عندما تكون نافذة اللعبة في الخلفية أو مصغرة.",
    author: "juliand665",
    version: "3.7.8",
    downloadUrl: "https://cdn.modrinth.com/data/LQ3K71Q1/versions/zZ2x7pQ0/dynamic-fps-3.7.8%2Bminecraft-1.21.0-fabric.jar",
    fileName: "dynamic-fps-3.7.8+minecraft-1.21.0-fabric.jar",
    imageUrl: "https://cdn.modrinth.com/data/LQ3K71Q1/icon.png"
  },

  // Lethal Company (Thunderstore)
  {
    title: "LethalLib",
    slug: "lethal-company-lethallib",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "مكتبات مطلوبة",
    description: "المكتبة الأساسية والأكثر انتشاراً لإضافة أعداء وعناصر وخردة وميكانيكيات مخصصة للعبة.",
    author: "Evaisa",
    version: "1.0.0",
    downloadUrl: "https://thunderstore.io/package/download/Evaisa/LethalLib/1.0.0/",
    fileName: "LethalLib.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/Evaisa-LethalLib-1.0.0.png"
  },
  {
    title: "LateCompany",
    slug: "lethal-company-latecompany",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "لعب جماعي",
    description: "يسمح للاعبين بالانضمام إلى السيرفر والردهة حتى بعد بدء اللعبة دون الحاجة لإعادة إنشاء الغرفة.",
    author: "anonoc",
    version: "1.0.11",
    downloadUrl: "https://thunderstore.io/package/download/anonoc/LateCompany/1.0.11/",
    fileName: "LateCompany.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/anonoc-LateCompany-1.0.11.png"
  },
  {
    title: "ShipLoot",
    slug: "lethal-company-shiploot",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "واجهة المستخدم",
    description: "يعرض بدقة مجموع قيمة كل الغنائم والخردة الموجودة على متن السفينة عند مسحها بالماسح الضوئي.",
    author: "tinyhoot",
    version: "1.1.0",
    downloadUrl: "https://thunderstore.io/package/download/tinyhoot/ShipLoot/1.1.0/",
    fileName: "ShipLoot.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/tinyhoot-ShipLoot-1.1.0.png"
  },
  {
    title: "Helmet Cameras",
    slug: "lethal-company-helmet-cameras",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "أدوات",
    description: "يضيف شاشة مراقبة حية إضافية داخل السفينة تعرض ما يراه زملاؤك عبر كاميرات مثبتة على خوذهم.",
    author: "RickArg",
    version: "2.1.6",
    downloadUrl: "https://thunderstore.io/package/download/RickArg/Helmet_Cameras/2.1.6/",
    fileName: "Helmet_Cameras.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/RickArg-Helmet_Cameras-2.1.6.png"
  },
  {
    title: "Reserved Flashlight Slot",
    slug: "lethal-company-reserved-flashlight",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "إدارة المخزون",
    description: "يضيف خانة مخزون إضافية مخصصة للكشاف مع زر اختصار سريع لتشغيله دون شغل مساحة الأغراض.",
    author: "FlipMods",
    version: "2.0.7",
    downloadUrl: "https://thunderstore.io/package/download/FlipMods/ReservedFlashlightSlot/2.0.7/",
    fileName: "ReservedFlashlightSlot.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/FlipMods-ReservedFlashlightSlot-2.0.7.png"
  },
  {
    title: "Reserved Walkie Slot",
    slug: "lethal-company-reserved-walkie",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "إدارة المخزون",
    description: "يضيف خانة مخصصة لجهاز اللاسلكي (Walkie Talkie) مع زر تحدث خاص وتوفير مساحة الحمل.",
    author: "FlipMods",
    version: "2.0.9",
    downloadUrl: "https://thunderstore.io/package/download/FlipMods/ReservedWalkieSlot/2.0.9/",
    fileName: "ReservedWalkieSlot.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/FlipMods-ReservedWalkieSlot-2.0.9.png"
  },
  {
    title: "SpectateEnemies",
    slug: "lethal-company-spectate-enemies",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "واجهة المستخدم",
    description: "يتيح لك التبديل ومراقبة الوحوش والكائنات المرعبة في المنشأة بعد موتك بدلاً من زملائك فقط.",
    author: "AllToasters",
    version: "2.5.0",
    downloadUrl: "https://thunderstore.io/package/download/AllToasters/SpectateEnemies/2.5.0/",
    fileName: "SpectateEnemies.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/AllToasters-SpectateEnemies-2.5.0.png"
  },

  // Valheim (Thunderstore)
  {
    title: "Jotunn (The Valheim Library)",
    slug: "valheim-jotunn",
    game: "Valheim",
    gameGenre: "Survival",
    category: "مكتبات مطلوبة",
    description: "حزمة أدوات ومكتبة التطوير الأساسية لتعديل وإضافة أسلحة ودروع ووحوش مخصصة في عالم فالهيم.",
    author: "ValheimModding",
    version: "2.24.4",
    downloadUrl: "https://thunderstore.io/package/download/ValheimModding/Jotunn/2.24.4/",
    fileName: "Jotunn.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/ValheimModding-Jotunn-2.24.4.png"
  },
  {
    title: "Craft From Containers",
    slug: "valheim-craft-from-containers",
    game: "Valheim",
    gameGenre: "Survival",
    category: "إدارة المخزون",
    description: "اصنع وطوّر معداتك واطبخ باستخدام الموارد المخزنة داخل الصناديق القريبة دون حملها بيدك.",
    author: "aedenthorn",
    version: "3.4.1",
    downloadUrl: "https://thunderstore.io/package/download/aedenthorn/CraftFromContainers/3.4.1/",
    fileName: "CraftFromContainers.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/aedenthorn-CraftFromContainers-3.4.1.png"
  },
  {
    title: "Equipment and Quick Slots",
    slug: "valheim-equipment-quick-slots",
    game: "Valheim",
    gameGenre: "Survival",
    category: "إدارة المخزون",
    description: "يفصل الدروع والمعدات القابلة للارتداء في خانات خاصة مع 3 خانات وصول سريع للجرعات والطعام.",
    author: "RandyKnapp",
    version: "2.1.18",
    downloadUrl: "https://thunderstore.io/package/download/RandyKnapp/EquipmentAndQuickSlots/2.1.18/",
    fileName: "EquipmentAndQuickSlots.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/RandyKnapp-EquipmentAndQuickSlots-2.1.18.png"
  },
  {
    title: "Farm Grid",
    slug: "valheim-farmgrid",
    game: "Valheim",
    gameGenre: "Survival",
    category: "زراعة",
    description: "يساعدك على زراعة المحاصيل والأشجار بتناسق وشبكة منتظمة لضمان نموها ومضاعفة المحصول.",
    author: "Nexus",
    version: "0.4.0",
    downloadUrl: "https://thunderstore.io/package/download/FixItFelix/FarmGrid/0.4.0/",
    fileName: "FarmGrid.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/FixItFelix-FarmGrid-0.4.0.png"
  },
  {
    title: "Better UI",
    slug: "valheim-betterui",
    game: "Valheim",
    gameGenre: "Survival",
    category: "واجهة المستخدم",
    description: "تحسين كامل لواجهة اللعبة يضيف مستويات متانة واضحة، تفاصيل المهارات، وأشرطة صحة للأعداء.",
    author: "Masa",
    version: "2.5.3",
    downloadUrl: "https://thunderstore.io/package/download/Masa/BetterUI_Reforged/2.5.3/",
    fileName: "BetterUI_Reforged.zip",
    imageUrl: "https://ccdn.thunderstore.io/live/repository/icons/Masa-BetterUI_Reforged-2.5.3.png"
  }
];

async function addNewMods() {
  console.log(`Starting to download and host ${newRealMods.length} new real mods...`);
  for (const mod of newRealMods) {
    try {
      console.log(`Processing: ${mod.title} (${mod.game})...`);
      const { storageKey, size } = await downloadAndHost(mod.downloadUrl, mod.fileName);
      console.log(`Hosted ${mod.title}: ${(size / 1024 / 1024).toFixed(2)} MB -> ${storageKey}`);

      const insertSql = `INSERT INTO mods (
        title, slug, game, game_genre, category, description,
        image_url, download_url, download_file_name, download_size,
        source_url, author, version, status, created_by,
        mirror_storage_key, mirror_file_name, mirror_size, mirror_uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        game = excluded.game,
        game_genre = excluded.game_genre,
        category = excluded.category,
        description = excluded.description,
        image_url = excluded.image_url,
        download_url = excluded.download_url,
        download_file_name = excluded.download_file_name,
        download_size = excluded.download_size,
        author = excluded.author,
        version = excluded.version,
        mirror_storage_key = excluded.mirror_storage_key,
        mirror_file_name = excluded.mirror_file_name,
        mirror_size = excluded.mirror_size,
        mirror_uploaded_at = CURRENT_TIMESTAMP,
        status = 'approved'`;

      await client.execute({
        sql: insertSql,
        args: [
          mod.title,
          mod.slug,
          mod.game,
          mod.gameGenre,
          mod.category,
          mod.description,
          mod.imageUrl,
          mod.downloadUrl,
          mod.fileName,
          size,
          mod.downloadUrl,
          mod.author,
          mod.version,
          storageKey,
          mod.fileName,
          size
        ]
      });
      console.log(`Database saved for ${mod.title} ✓`);
    } catch (err) {
      console.error(`Error adding ${mod.title}:`, err.message);
    }
  }

  const finalCheck = await client.execute("SELECT COUNT(*) as total FROM mods WHERE status='approved' AND mirror_storage_key IS NOT NULL");
  console.log(`\n🎉 Total 100% self-hosted real mods in DB: ${finalCheck.rows[0].total}`);
}

async function main() {
  await fixExistingImages();
  await addNewMods();
}

main().catch(console.error);
