import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

const realMods = [
  {
    title: "Sodium",
    slug: "minecraft-sodium",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "تحسين الأداء",
    description:
      "محرك عرض وبصريات بديل عالي الكفاءة للعبة ماينكرافت، يرفع معدل الإطارات (FPS) بشكل ملحوظ ويقضي على التقطيع، مع الحفاظ على المظهر الكلاسيكي للعبة.",
    imageUrl:
      "https://cdn.modrinth.com/data/AANobbMI/images/2ae9fc94eb44487b41e8c1481d9f8fc530939c36.png",
    downloadUrl: "https://modrinth.com/mod/sodium",
    downloadFileName: "sodium-fabric-0.5.11+mc1.21.jar",
    downloadSize: 1120000,
    sourceUrl: "https://github.com/CaffeineMC/sodium-fabric",
    author: "CaffeineMC",
    version: "0.5.11",
  },
  {
    title: "Iris Shaders",
    slug: "minecraft-iris-shaders",
    game: "Minecraft",
    gameGenre: "Sandbox",
    category: "الرسوميات",
    description:
      "محمّل تظليل (Shaders) حديث ومفتوح المصدر متوافق تمامًا مع مود Sodium، يتيح تشغيل أحدث حزم التظليل والظلال والانعكاسات الواقعية بأداء سلس واستقرار عالٍ.",
    imageUrl:
      "https://cdn.modrinth.com/data/YL57xq9U/images/9625345719ae56b278dfb91864197e4eefdb01db.png",
    downloadUrl: "https://modrinth.com/mod/iris",
    downloadFileName: "iris-1.7.5+mc1.21.jar",
    downloadSize: 4500000,
    sourceUrl: "https://github.com/IrisShaders/Iris",
    author: "IrisTeam",
    version: "1.7.5",
  },
  {
    title: "Terralith",
    slug: "minecraft-terralith",
    game: "Minecraft",
    gameGenre: "Adventure",
    category: "عوالم جديدة",
    description:
      "يحدث ثورة شاملة في توليد تضاريس عوالم ماينكرافت بتقديم ما يقارب 100 منطقة بيئية (Biome) جديدة وجبال شاهقة ووديان خلابة دون إضافة كتل خارجية مصطنعة.",
    imageUrl:
      "https://cdn.modrinth.com/data/8oi3bvq5/images/f3dcab8bb2be9d94943fcfad1fb9709cf9321f8a.jpeg",
    downloadUrl: "https://modrinth.com/mod/terralith",
    downloadFileName: "Terralith_1.21_v2.5.7.jar",
    downloadSize: 22000000,
    sourceUrl: "https://stardustlabs.net",
    author: "Stardust Labs",
    version: "2.5.7",
  },
  {
    title: "Xaero's Minimap",
    slug: "minecraft-xaeros-minimap",
    game: "Minecraft",
    gameGenre: "Adventure",
    category: "الاستكشاف",
    description:
      "خريطة مصغرة متطورة وسهلة التخصيص لواجهة ماينكرافت، تعرض مواقع الكائنات والوحوش واللاعبين المحيطين، مع إمكانية حفظ علامات ونقاط الطريق (Waypoints) للعودة لقاعدتك بسهولة.",
    imageUrl:
      "https://cdn.modrinth.com/data/1bokaNcj/images/a2b281f6d90dafb87efbf4179e88dc6f92027e4e.png",
    downloadUrl: "https://modrinth.com/mod/xaeros-minimap",
    downloadFileName: "Xaeros_Minimap_24.7.1_Fabric_1.21.jar",
    downloadSize: 1800000,
    sourceUrl: "https://chmgrts.biomewiki.com",
    author: "xaero96",
    version: "24.7.1",
  },
  {
    title: "MoreCompany",
    slug: "lethal-company-morecompany",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "لعب جماعي",
    description:
      "مود أساسي للعبة Lethal Company يرفع سعة الردهة (Lobby) لتصل حتى 32 لاعبًا بدلاً من 4 لاعبين فقط، مع واجهة ملابس ومستحضرات تجميلية مرحة للطاقم.",
    imageUrl: "https://thunderstore.io/package/notnotnotswipez/MoreCompany/icon/",
    downloadUrl: "https://thunderstore.io/c/lethal-company/p/notnotnotswipez/MoreCompany/",
    downloadFileName: "MoreCompany.zip",
    downloadSize: 1450000,
    sourceUrl: "https://github.com/notnotnotswipez/MoreCompany",
    author: "notnotnotswipez",
    version: "1.11.0",
  },
  {
    title: "TooManyEmotes",
    slug: "lethal-company-toomanyemotes",
    game: "Lethal Company",
    gameGenre: "Horror",
    category: "حركات وتجميل",
    description:
      "يضيف أكثر من 300 حركة وتعبير ورقصة حركية لشخصيات Lethal Company مع عجلة سهلة لاختيار الرقصات ومؤثرات صوتية فريدة لمزيد من المرح أثناء المغامرة.",
    imageUrl: "https://thunderstore.io/package/FlipMods/TooManyEmotes/icon/",
    downloadUrl: "https://thunderstore.io/c/lethal-company/p/FlipMods/TooManyEmotes/",
    downloadFileName: "TooManyEmotes.zip",
    downloadSize: 8500000,
    sourceUrl: "https://github.com/FlipMods/TooManyEmotes",
    author: "FlipMods",
    version: "2.2.8",
  },
  {
    title: "Epic Loot",
    slug: "valheim-epicloot",
    game: "Valheim",
    gameGenre: "Survival",
    category: "معدات وغنائم",
    description:
      "يحول نظام الغنائم في لعبة Valheim إلى تجربة RPG ساحرة شبيهة بـ Diablo؛ تسقط الوحوش معدات سحرية ونادرة وأسطورية مع إمكانية سحر الأسلحة وتفكيكها للحصول على شظايا سحرية.",
    imageUrl: "https://thunderstore.io/package/RandyKnapp/EpicLoot/icon/",
    downloadUrl: "https://thunderstore.io/c/valheim/p/RandyKnapp/EpicLoot/",
    downloadFileName: "EpicLoot.zip",
    downloadSize: 15400000,
    sourceUrl: "https://github.com/randyknapp/ValheimMods",
    author: "RandyKnapp",
    version: "0.10.4",
  },
  {
    title: "Valheim Raft",
    slug: "valheim-valheimraft",
    game: "Valheim",
    gameGenre: "Survival",
    category: "بناء واستكشاف",
    description:
      "يسمح للاعبين ببناء وتصميم سفن ومراكب شراعية عملاقة وقواعد عائمة مخصصة بالكامل باستخدام أدوات البناء الأصلية والإبحار بها عبر محيطات فالهيم.",
    imageUrl: "https://thunderstore.io/package/Sarcen/ValheimRAFT/icon/",
    downloadUrl: "https://thunderstore.io/c/valheim/p/Sarcen/ValheimRAFT/",
    downloadFileName: "ValheimRAFT.zip",
    downloadSize: 4200000,
    sourceUrl: "https://github.com/zolantris/ValheimRAFT",
    author: "Sarcen",
    version: "1.4.9",
  },
  {
    title: "ItemStats",
    slug: "riskofrain2-itemstats",
    game: "Risk of Rain 2",
    gameGenre: "Roguelike",
    category: "معلومات العناصر",
    description:
      "يعرض أرقامًا وتفاصيل دقيقة في وصف كل عنصر داخل اللعبة توضح نسبة زيادة الضرر، وسرعة الحركة، وتأثير تكرار العناصر وتراكمها (Stacking) أثناء الجولة.",
    imageUrl: "https://thunderstore.io/package/ontracks/ItemStats/icon/",
    downloadUrl: "https://thunderstore.io/c/risk-of-rain-2/p/ontracks/ItemStats/",
    downloadFileName: "ItemStats.zip",
    downloadSize: 320000,
    sourceUrl: "https://github.com/ontracks/ItemStatsMod",
    author: "ontracks",
    version: "2.4.2",
  },
  {
    title: "SMAPI - Stardew Modding API",
    slug: "stardew-valley-smapi",
    game: "Stardew Valley",
    gameGenre: "Simulation",
    category: "مكتبات مطلوبة",
    description:
      "المشغّل والواجهة الأساسية البرمجية الأكثر موثوقية لتشغيل مودات وإضافات لعبة Stardew Valley بأمان مع التحديثات المستمرة وإصلاح التوافقية.",
    imageUrl: "https://raw.githubusercontent.com/Pathoschild/SMAPI/develop/src/SMAPI/Assets/icon.png",
    downloadUrl: "https://smapi.io/",
    downloadFileName: "SMAPI-4.0.8-installer.zip",
    downloadSize: 12000000,
    sourceUrl: "https://github.com/Pathoschild/SMAPI",
    author: "Pathoschild",
    version: "4.0.8",
  },
  {
    title: "Stardew Valley Expanded",
    slug: "stardew-valley-expanded",
    game: "Stardew Valley",
    gameGenre: "Simulation",
    category: "توسعة شاملة",
    description:
      "أضخم توسعة مجتمعية للعبة وادي ستاردو، تضيف مناطق جديدة بالكامل، وشخصيات جديدة قابلة للزواج، ومحاصيل ومهرجانات وأحداث قصصية مذهلة تعيد للعبة رونقها.",
    imageUrl:
      "https://staticdelivery.nexusmods.com/mods/1303/images/3753/3753-1555519184-1596204099.png",
    downloadUrl: "https://www.nexusmods.com/stardewvalley/mods/3753",
    downloadFileName: "Stardew Valley Expanded.zip",
    downloadSize: 45000000,
    sourceUrl: "https://github.com/FlashShifter/StardewValleyExpanded",
    author: "FlashShifter",
    version: "1.14.44",
  },
  {
    title: "SkyUI",
    slug: "skyrim-se-skyui",
    game: "The Elder Scrolls V: Skyrim Special Edition",
    gameGenre: "RPG",
    category: "واجهة المستخدم",
    description:
      "تعديل شامل لواجهة مستخدم سكايرم يحول القوائم لتناسب التحكم بالماوس ولوحة المفاتيح مع دعم متقدم لتصنيف وفرز العناصر وقائمة تكوين المودات (MCM).",
    imageUrl:
      "https://staticdelivery.nexusmods.com/mods/1704/images/12604/12604-1507204480-1659223363.png",
    downloadUrl: "https://www.nexusmods.com/skyrimspecialedition/mods/12604",
    downloadFileName: "SkyUI_5_2_SE.7z",
    downloadSize: 2800000,
    sourceUrl: "https://github.com/schlangster/skyui",
    author: "SkyUI Team",
    version: "5.2SE",
  },
];

async function insertMods() {
  const insertSql = `INSERT INTO mods (
    title, slug, game, game_genre, category, description,
    image_url, download_url, download_file_name, download_size,
    source_url, author, version, status, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'hi423179@gmail.com')
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
    source_url = excluded.source_url,
    author = excluded.author,
    version = excluded.version,
    status = 'approved',
    created_by = 'hi423179@gmail.com'`;

  for (const m of realMods) {
    await client.execute({
      sql: insertSql,
      args: [
        m.title,
        m.slug,
        m.game,
        m.gameGenre,
        m.category,
        m.description,
        m.imageUrl,
        m.downloadUrl,
        m.downloadFileName,
        m.downloadSize,
        m.sourceUrl,
        m.author,
        m.version,
      ],
    });
    console.log("Inserted:", m.title);
  }

  const res = await client.execute("SELECT COUNT(*) as count FROM mods WHERE status = 'approved'");
  console.log("Total approved mods in DB:", res.rows[0].count);
}

insertMods().catch(console.error);
