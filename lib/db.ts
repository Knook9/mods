import "server-only";
import { createClient, type Client, type InArgs } from "@libsql/client";
import { randomUUID } from "node:crypto";
import communityModsData from "@/lib/community-mods.json";
import communityGameModsData from "@/lib/community-game-mods.json";
import communityPopularModsData from "@/lib/community-popular-mods.json";
import bannerlordWorkshopModsData from "@/lib/bannerlord-workshop-mods.json";
import { isBlockedGameKey } from "@/lib/blocked-games";

export type ModStatus = "pending" | "approved" | "rejected";

export const genreLabels: Record<string, string> = {
  Sandbox: "عالم مفتوح",
  Adventure: "مغامرات",
  RPG: "تقمّص الأدوار (RPG)",
  Simulation: "محاكاة",
  Strategy: "استراتيجية",
  Survival: "بقاء",
  Action: "أكشن",
  Horror: "رعب",
  Roguelike: "روغلايك",
};

export function isGalleryImage(imageUrl: string | null) {
  return Boolean(imageUrl && (imageUrl.includes("/images/") || imageUrl.includes("steamstatic.com") || imageUrl.includes("steamusercontent.com") || imageUrl.includes("unsplash.com") || imageUrl.includes(".r2.dev") || imageUrl.includes("cdn.")));
}

export type GameMod = {
  id: number;
  title: string;
  slug: string;
  game: string;
  gameGenre: string;
  category: string;
  description: string;
  imageUrl: string | null;
  downloadUrl: string;
  downloadFileName: string | null;
  downloadSize: number | null;
  mirrorFileName?: string | null;
  mirrorSize?: number | null;
  sourceUrl: string | null;
  author: string;
  version: string | null;
  createdAt: string;
};

export type SubmittedMod = GameMod & {
  status: ModStatus;
  uploadedFileName: string | null;
  review: ModReview | null;
};

export type ModReview = {
  analyzedAt: string;
  engine: "gemini" | "openai" | "local";
  model?: string;
  risk: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
  findings: Array<{ severity: "low" | "medium" | "high"; title: string; detail: string }>;
  scannedFiles: number;
  omittedFiles: number;
};

let initialization: Promise<Client> | null = null;

const categoryNames: Record<string, string> = {
  optimization: "تحسين الأداء",
  utility: "أدوات",
  decoration: "الرسوميات",
  adventure: "الاستكشاف",
  food: "معلومات الطعام",
  storage: "إدارة المخزون",
  worldgen: "عوالم جديدة",
  equipment: "إضافات المعدات",
  library: "مكتبات مطلوبة",
  management: "إدارة اللعبة",
  mobs: "تحسين الكائنات",
  cursed: "إضافات متنوعة",
};

const steamWorkshopCategoryNames: Record<string, string> = {
  "Graphical Enhancement": "تحسينات الرسوميات",
  "Map Pack": "خرائط",
  "Partial Conversion": "تحويل جزئي",
  Sound: "صوتيات",
  "Total Conversion": "تحويل شامل",
  Troops: "القوات",
  UI: "واجهة المستخدم",
  Utility: "أدوات",
  "Weapons and Armour": "أسلحة ودروع",
  Other: "متنوع",
};

const localizedDescriptions: Record<string, string> = {
  sodium: "محرك عرض بديل عالي الأداء يحسّن معدل الإطارات ويقلل التقطّع.",
  iris: "محمّل تظليل حديث متوافق مع حزم تظليل Minecraft.",
  lithium: "تحسينات لمنطق اللعبة تقلل استهلاك المعالجة في اللعب الفردي والخوادم.",
  "ferrite-core": "تقليل استهلاك ذاكرة Minecraft لتحسين الأداء.",
  "fabric-api": "مكتبة أساسية تعتمد عليها مودات كثيرة لمنصة Fabric.",
  "xaeros-minimap": "خريطة مصغّرة للعالم مع مواقع اللاعبين والكائنات ونقاط الطريق.",
  modmenu: "يعرض قائمة المودات المثبتة ويسهّل الوصول إلى إعداداتها.",
  entityculling: "يحسّن الأداء بتجاوز رسم الكتل والكائنات غير الظاهرة.",
  immediatelyfast: "تحسين تسريع العرض والواجهة في Minecraft.",
  continuity: "يدعم الخامات المتصلة لتحسين مظهر الزجاج والكتل المتجاورة.",
  lambdynamiclights: "يضيف إضاءة ديناميكية من المشاعل والأدوات المضيئة.",
  appleskin: "يعرض معلومات إضافية عن الطعام والجوع على واجهة اللعب.",
  jade: "يعرض معلومات عن الكتلة أو الكائن الذي تشير إليه.",
  shulkerboxtooltip: "يعرض محتويات صناديق Shulker عند المرور عليها بالمؤشر.",
  betterf3: "يعيد تصميم شاشة معلومات F3 لتصبح أوضح وقابلة للتخصيص.",
  zoomify: "إضافة تقريب مرنة مع خيارات تخصيص متعددة.",
  terralith: "يضيف مناطق أحيائية وتضاريس جديدة للعالم باستخدام كتل اللعبة الأصلية.",
  "natures-compass": "يساعدك على تحديد موقع المناطق الأحيائية في العالم.",
  waystones: "أحجار انتقال تتيح السفر بين نقاط محددة في العالم.",
  trinkets: "نظام إضافات لإضافة الخواتم والإكسسوارات القابلة للارتداء.",
  travelersbackpack: "حقائب قابلة للتطوير لتوسيع مساحة التخزين أثناء الاستكشاف.",
  "cloth-config": "مكتبة إعدادات تعتمد عليها مودات متعددة.",
  "architectury-api": "مكتبة توافق تساعد المطورين على دعم أكثر من منصة مودات.",
  "sodium-extra": "إضافة توسّع إعدادات وخيارات Sodium.",
  "reeses-sodium-options": "واجهة بديلة ومنظمة لقائمة إعدادات Sodium.",
  indium: "إضافة توافق بين Sodium وواجهة الرسم الخاصة بـ Fabric.",
  lithostitched: "مكتبة توفر أدوات التوافق والتحكم لتوليد العوالم.",
  "cardinal-components-api": "مكتبة مكونات بيانات تستخدمها مودات Fabric.",
  emi: "عارض للوصفات والعناصر مع واجهة سهلة للبحث داخل اللعبة.",
  "dynamic-fps": "يخفف استهلاك موارد الجهاز عندما تكون اللعبة في الخلفية.",
  modelfix: "إصلاح الفجوات المرئية في نماذج الكتل والعناصر.",
  moreculling: "تحسينات للرسم بتجنب عرض أجزاء غير مرئية.",
  "entity-model-features": "يدعم نماذج الكائنات المخصصة بصيغ متوافقة مع OptiFine.",
  visuality: "يحسن المؤثرات البصرية والجزيئات داخل اللعبة.",
  spark: "أداة تحليل أداء لخوادم وعملاء Minecraft.",
};

const localizedTitles: Record<string, string> = {
  jade: "Jade",
};

type CommunityMod = {
  slug: string;
  title: string;
  game: string;
  gameGenre?: string;
  category: string;
  description: string;
  imageUrl: string | null;
  downloadUrl: string;
  downloadFileName: string;
  downloadSize: number | null;
  author: string;
  version: string;
  sourceUrl: string;
};

const genresBySlug: Record<string, string> = {
  "xaeros-minimap": "Adventure",
  terralith: "Adventure",
  "natures-compass": "Adventure",
  waystones: "Adventure",
  travelersbackpack: "Adventure",
  lambdynamiclights: "Adventure",
  trinkets: "RPG",
};

const communityMods: CommunityMod[] = (communityModsData as CommunityMod[]).map((mod) => ({
  ...mod,
  slug: mod.slug === "iris" ? "iris-shaders" : mod.slug,
  title: localizedTitles[mod.slug] ?? mod.title,
  category: categoryNames[mod.category] ?? "أدوات",
  description: localizedDescriptions[mod.slug] ?? mod.description,
}));

const gameModCategories: Record<string, string> = {
  "lethal-company-morecompany": "لعب جماعي",
  "lethal-company-toomanyemotes": "حركات وتجميل",
  "lethal-company-yippeemod": "أصوات",
  "lethal-company-mimics": "أعداء جدد",
  "lethal-company-more-suits": "أزياء",
  "lethal-company-reserveditemslotcore": "مكتبات",
  "lethal-company-lethallevelloader": "خرائط ومكتبات",
  "valheim-epicloot": "معدات وغنائم",
  "valheim-planteverything": "زراعة",
  "valheim-equipmentandquickslots": "إدارة المخزون",
  "valheim-betterui": "واجهة المستخدم",
  "valheim-valheimraft": "بناء واستكشاف",
  "valheim-farmgrid": "زراعة",
  "valheim-jotunn": "مكتبات",
  "riskofrain2-itemstats": "معلومات العناصر",
  "riskofrain2-lookingglass": "واجهة المستخدم",
  "riskofrain2-dropitem": "أدوات",
  "riskofrain2-aetherium": "محتوى جديد",
  "riskofrain2-sharesuite": "لعب جماعي",
  "riskofrain2-propersave": "حفظ وتقدم",
  "riskofrain2-rtautosprintex": "تحسينات اللعب",
  "riskofrain2-quickrestart": "أدوات",
  "content-warning-morecolors": "تجميل",
  "content-warning-makemeragdoll": "حركات",
  "content-warning-more-comments": "محتوى جديد",
  "content-warning-mirage": "أعداء ومؤثرات",
  "content-warning-virality": "لعب جماعي",
  "content-warning-betterspectate": "واجهة المستخدم",
  "content-warning-contentsettings": "مكتبات",
  "repo-mimic": "أعداء جدد",
  "repo-moreheadplus": "تجميل",
  "repo-morerevivehp": "تحسينات اللعب",
  "repo-moreplayers": "لعب جماعي",
  "repo-repoconfig": "إعدادات",
};

const gameModDescriptions: Record<string, string> = {
  "lethal-company-morecompany": "يزيد عدد اللاعبين المسموح بهم في الردهة ويضيف خيارات تخصيص للشخصيات.",
  "lethal-company-toomanyemotes": "يضيف أكثر من 300 حركة تعبيرية مع عجلة استخدام وخيارات للموسيقى.",
  "lethal-company-yippeemod": "يستبدل صوت حشرة التخزين بمؤثر صوتي مرح.",
  "lethal-company-mimics": "يضيف وحشًا جديدًا يقلّد الأبواب ويحوّل الاستكشاف إلى مفاجأة مخيفة.",
  "lethal-company-more-suits": "يضيف أزياء جديدة قابلة للاختيار لطاقم السفينة.",
  "lethal-company-reserveditemslotcore": "مكتبة مطلوبة لإضافات الخانات المحجوزة للأدوات.",
  "lethal-company-lethallevelloader": "مكتبة تحميل خرائط ومحتوى مخصص للعبة.",
  "valheim-epicloot": "يضيف غنائم سحرية وأدوات قابلة للتطوير والسحر في Valheim.",
  "valheim-planteverything": "يتيح زراعة أنواع إضافية من النباتات والأشجار والموارد.",
  "valheim-equipmentandquickslots": "يضيف خانات منفصلة للمعدات وخانات سريعة قابلة للاختصار.",
  "valheim-betterui": "يحسن واجهة اللعب ويضيف معلومات أوضح عن العناصر والشخصية.",
  "valheim-valheimraft": "ابنِ سفنًا ومركبات قابلة للبناء واستكشف بها عالم Valheim.",
  "valheim-farmgrid": "يساعد على زراعة المحاصيل بانتظام ضمن شبكة دقيقة.",
  "valheim-jotunn": "مكتبة أساسية يعتمد عليها عدد من مودات Valheim.",
  "riskofrain2-itemstats": "يعرض إحصاءات وتفاصيل أوضح عن العناصر داخل اللعبة.",
  "riskofrain2-lookingglass": "واجهة معلومات تعرض خصائص العناصر واللاعب وتضيف أدوات مفيدة.",
  "riskofrain2-dropitem": "يسمح بإسقاط العناصر من المخزون باستخدام أمر أو اختصار.",
  "riskofrain2-aetherium": "يضيف عناصر ومعدات وآثارًا جديدة إلى Risk of Rain 2.",
  "riskofrain2-sharesuite": "يتيح مشاركة العناصر والمال والمعدات بين أعضاء الفريق.",
  "riskofrain2-propersave": "يحفظ التقدم ويتيح متابعة الجولات من حيث توقفت.",
  "riskofrain2-rtautosprintex": "يضيف خيارات للتحكم في الركض التلقائي.",
  "riskofrain2-quickrestart": "اختصارات لإعادة تشغيل الجولة بسرعة.",
  "content-warning-morecolors": "يضيف ألوانًا إضافية للشخصيات والبدلات.",
  "content-warning-makemeragdoll": "يتيح للاعب التحول إلى هيئة دمية متحركة باستخدام زر اختصار.",
  "content-warning-more-comments": "يضيف تعليقات جديدة ويحسن التعليقات أثناء عرض الفيديو.",
  "content-warning-mirage": "يجعل الأعداء يقلدون أصوات اللاعبين لزيادة التوتر.",
  "content-warning-virality": "يوسع عدد اللاعبين في الردهة ويدعم الانضمام بعد بدء الجولة.",
  "content-warning-betterspectate": "يحسن واجهة وضع المشاهدة في Content Warning.",
  "content-warning-contentsettings": "مكتبة لإضافة إعدادات مخصصة لمودات Content Warning.",
  "repo-mimic": "يضيف كائنًا مقلدًا خطيرًا إلى R.E.P.O.",
  "repo-moreheadplus": "يضيف خيارات ومحتوى تجميليًا جديدًا للرأس والشخصيات.",
  "repo-morerevivehp": "يعدل نقاط الصحة التي يحصل عليها اللاعب عند إحيائه.",
  "repo-moreplayers": "يرفع عدد اللاعبين المدعومين في الجلسة.",
  "repo-repoconfig": "يضيف واجهة لإدارة إعدادات مودات R.E.P.O.",
};

const otherGameMods: CommunityMod[] = communityGameModsData as CommunityMod[];
const popularGameMods: CommunityMod[] = communityPopularModsData as CommunityMod[];
const bannerlordWorkshopMods: CommunityMod[] = bannerlordWorkshopModsData as CommunityMod[];

const allCommunityMods = [
  ...communityMods,
  ...otherGameMods,
  ...popularGameMods,
  ...bannerlordWorkshopMods,
].map((mod) => ({
  ...mod,
  gameGenre: mod.gameGenre ?? genresBySlug[mod.slug] ?? "Sandbox",
  category:
    gameModCategories[mod.slug] ??
    categoryNames[mod.category] ??
    steamWorkshopCategoryNames[mod.category] ??
    mod.category,
  description: gameModDescriptions[mod.slug] ?? localizedDescriptions[mod.slug] ?? mod.description,
}));

const toMod = (row: Record<string, unknown>): GameMod => ({
  id: Number(row.id),
  title: String(row.title),
  slug: String(row.slug),
  game: String(row.game),
  gameGenre: String(row.game_genre ?? "Sandbox"),
  category: String(row.category),
  description: String(row.description),
  imageUrl: row.image_url ? String(row.image_url) : null,
  downloadUrl: String(row.download_url),
  downloadFileName: row.download_file_name ? String(row.download_file_name) : null,
  downloadSize: row.download_size == null ? null : Number(row.download_size),
  mirrorFileName: row.mirror_file_name ? String(row.mirror_file_name) : null,
  mirrorSize: row.mirror_size == null ? null : Number(row.mirror_size),
  sourceUrl: row.source_url ? String(row.source_url) : null,
  author: String(row.author),
  version: row.version ? String(row.version) : null,
  createdAt: String(row.created_at),
});

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    game TEXT NOT NULL,
    game_genre TEXT NOT NULL DEFAULT 'Sandbox',
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    download_url TEXT NOT NULL,
    author TEXT NOT NULL,
    version TEXT,
    download_file_name TEXT,
    download_size INTEGER,
    source_url TEXT,
    created_by TEXT,
    upload_storage_key TEXT,
    upload_file_name TEXT,
    upload_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_mods_public ON mods(status, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS mod_reviews (
    mod_id INTEGER PRIMARY KEY REFERENCES mods(id) ON DELETE CASCADE,
    report_json TEXT NOT NULL,
    analyzed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

// تُشتق بصمة الكتالوج من عدد المودات ومعرّفاتها، فأي تحديث للكتالوج يعيد زرع البيانات في Turso.
function catalogSeedVersion(mods: Array<{ slug: string }>) {
  let hash = 5381;
  for (const mod of mods) {
    for (let index = 0; index < mod.slug.length; index += 1) {
      hash = ((hash << 5) + hash + mod.slug.charCodeAt(index)) | 0;
    }
  }
  return `${mods.length}:${(hash >>> 0).toString(36)}`;
}

const seedSql = `  INSERT INTO mods
    (title, slug, game, category, description, image_url, download_url, author, version,
     download_file_name, download_size, source_url, game_genre, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    game = excluded.game,
    category = excluded.category,
    description = excluded.description,
    image_url = excluded.image_url,
    download_url = excluded.download_url,
    author = excluded.author,
    version = excluded.version,
    download_file_name = excluded.download_file_name,
    download_size = excluded.download_size,
    source_url = excluded.source_url,
    game_genre = excluded.game_genre
  WHERE mods.status = 'approved'
    AND mods.created_by IS NULL
    AND (mods.source_url IS NULL OR mods.source_url = excluded.source_url)
`;

async function initializeDatabase(): Promise<Client> {
  const databaseUrl = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!databaseUrl || !authToken) {
    throw new Error("Turso is required. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local, then restart the app.");
  }
  if (!databaseUrl.startsWith("libsql://") && !databaseUrl.startsWith("https://")) {
    throw new Error("TURSO_DATABASE_URL must use the libsql:// or https:// scheme.");
  }
  const db = createClient({ url: databaseUrl, authToken });
  await db.batch(schemaStatements);
  const result = await db.execute("PRAGMA table_info(mods)");
  const modColumns = new Set(result.rows.map((row) => String(row.name)));
  for (const [name, type] of [
    ["created_by", "TEXT"],
    ["download_file_name", "TEXT"],
    ["download_size", "INTEGER"],
    ["source_url", "TEXT"],
    ["game_genre", "TEXT NOT NULL DEFAULT 'Sandbox'"],
    ["upload_storage_key", "TEXT"],
    ["upload_file_name", "TEXT"],
    ["upload_size", "INTEGER"],
    ["mirror_storage_key", "TEXT"],
    ["mirror_file_name", "TEXT"],
    ["mirror_size", "INTEGER"],
    ["mirror_uploaded_at", "TEXT"],
    ["cf_mod_id", "INTEGER"],
    ["cf_file_id", "INTEGER"],
    ["cf_game_id", "INTEGER"],
    ["cf_game_slug", "TEXT"],
  ] as const) {
    if (!modColumns.has(name)) await db.execute(`ALTER TABLE mods ADD COLUMN ${name} ${type}`);
  }

  const seedVersion = await db.execute({
    sql: "SELECT value FROM app_meta WHERE key = 'catalog_seed_version'",
  });
  const currentSeedVersion = catalogSeedVersion(allCommunityMods);
  if (seedVersion.rows[0]?.value === currentSeedVersion) return db;

  for (let offset = 0; offset < allCommunityMods.length; offset += 250) {
    const batch = allCommunityMods.slice(offset, offset + 250).map((mod) => [
      seedSql,
      [
        mod.title,
        mod.slug,
        mod.game,
        mod.category,
        mod.description,
        mod.imageUrl,
        mod.downloadUrl,
        mod.author,
        mod.version,
        mod.downloadFileName,
        mod.downloadSize,
        mod.sourceUrl,
        mod.gameGenre,
      ] as InArgs,
    ] as [string, InArgs]);
    await db.batch(batch, "write");
  }
  await db.execute({
    sql: `INSERT INTO app_meta (key, value) VALUES ('catalog_seed_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [currentSeedVersion],
  });
  return db;
}

function ensureDatabase() {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export async function recordMemberLogin(email: string, name: string, imageUrl: string | null) {
  const db = await ensureDatabase();
  await db.execute({
    sql: `INSERT INTO members (email, name, image_url, last_login_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        image_url = excluded.image_url,
        last_login_at = CURRENT_TIMESTAMP`,
    args: [email, name, imageUrl],
  });
}

type PublishedModFilters = { search?: string; game?: string; category?: string; genre?: string };

const publicCatalogVisibility = `(
  created_by IS NOT NULL OR (
    cf_mod_id IS NULL
    AND slug NOT LIKE 'gb-%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%curseforge.com%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%forgecdn.net%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%gamebanana.com%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%modrinth.com%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%thunderstore.io%'
    AND lower(COALESCE(source_url, '')) NOT LIKE '%thunderstorecdn.com%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%curseforge.com%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%forgecdn.net%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%gamebanana.com%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%modrinth.com%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%thunderstore.io%'
    AND lower(COALESCE(download_url, '')) NOT LIKE '%thunderstorecdn.com%'
  )
)`;

function publishedModWhere(filters: PublishedModFilters) {
  const clauses = ["status = 'approved'", publicCatalogVisibility];
  const values: string[] = [];
  if (filters.search?.trim()) {
    clauses.push("(title LIKE ? OR game LIKE ? OR description LIKE ? OR author LIKE ?)");
    const search = `%${filters.search.trim()}%`;
    values.push(search, search, search, search);
  }
  if (filters.game) {
    clauses.push("game = ?");
    values.push(filters.game);
  }
  if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
  }
  if (filters.genre) {
    clauses.push("game_genre = ?");
    values.push(filters.genre);
  }
  return { where: clauses.join(" AND "), values };
}

export async function getPublishedMods(
  options: PublishedModFilters & { page?: number; pageSize?: number } = {},
) : Promise<GameMod[]> {
  const db = await ensureDatabase();
  const { where, values } = publishedModWhere(options);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(96, Math.max(1, Math.trunc(options.pageSize ?? 48)));
  const result = await db.execute({
    sql: `SELECT * FROM mods WHERE ${where} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`,
    args: [...values, pageSize, (page - 1) * pageSize],
  });
  const rows = result.rows as unknown as Record<string, unknown>[];
  return rows.map(toMod);
}

export async function getPublishedModCount(filters: PublishedModFilters = {}) {
  const db = await ensureDatabase();
  const { where, values } = publishedModWhere(filters);
  const result = await db.execute({ sql: `SELECT COUNT(*) AS count FROM mods WHERE ${where}`, args: values });
  return Number(result.rows[0]?.count ?? 0);
}

export async function getModBySlug(slug: string) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: `SELECT * FROM mods WHERE slug = ? AND status = 'approved' AND ${publicCatalogVisibility}`,
    args: [slug],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  const mod = toMod(row);
  // حماية إضافية: لا نعرض أي مود ينتمي للعبة محجوبة حتى لو بقي سجل قديم في القاعدة.
  if (isBlockedGameKey("", mod.game)) return null;
  return mod;
}

export type ModMirror = { storageKey: string; fileName: string; size: number };

export async function getModMirrorBySlug(slug: string): Promise<ModMirror | null> {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: `SELECT mirror_storage_key, mirror_file_name, mirror_size FROM mods
      WHERE slug = ? AND status = 'approved' AND mirror_storage_key IS NOT NULL`,
    args: [slug],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row?.mirror_storage_key) return null;
  return {
    storageKey: String(row.mirror_storage_key),
    fileName: String(row.mirror_file_name ?? "mod-file"),
    size: Number(row.mirror_size ?? 0),
  };
}

export async function setModMirror(
  id: number,
  mirror: { storageKey: string; fileName: string; size: number } | null,
) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: mirror
      ? `UPDATE mods SET mirror_storage_key = ?, mirror_file_name = ?, mirror_size = ?,
          mirror_uploaded_at = CURRENT_TIMESTAMP WHERE id = ?`
      : `UPDATE mods SET mirror_storage_key = NULL, mirror_file_name = NULL, mirror_size = NULL,
          mirror_uploaded_at = NULL WHERE id = ?`,
    args: mirror
      ? [mirror.storageKey, mirror.fileName, mirror.size, id]
      : [id],
  });
  return result.rowsAffected > 0;
}

export async function getCatalogOptions() {
  const db = await ensureDatabase();
  const [gamesResult, categoriesResult, genresResult] = await Promise.all([
    db.execute(`SELECT DISTINCT game FROM mods WHERE status = 'approved' AND ${publicCatalogVisibility} ORDER BY game`),
    db.execute(`SELECT DISTINCT category FROM mods WHERE status = 'approved' AND ${publicCatalogVisibility} ORDER BY category`),
    db.execute(`SELECT DISTINCT game_genre FROM mods WHERE status = 'approved' AND ${publicCatalogVisibility} ORDER BY game_genre`),
  ]);
  const games = gamesResult.rows.map((row) => String(row.game));
  const categories = categoriesResult.rows.map((row) => String(row.category));
  const genres = genresResult.rows.map((row) => String(row.game_genre));
  return { games, categories, genres };
}

export async function createSubmission(
  mod: Omit<GameMod, "id" | "slug" | "createdAt" | "downloadFileName" | "downloadSize" | "sourceUrl">,
  createdBy: string,
  upload: { storageKey: string; fileName: string; size: number } | null = null,
) {
  const db = await ensureDatabase();
  const baseSlug =
    mod.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "mod";
  const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
  const result = await db.execute({
    sql: `INSERT INTO mods
        (title, slug, game, game_genre, category, description, image_url, download_url, author, version, created_by,
         upload_storage_key, upload_file_name, upload_size)
       VALUES (@title, @slug, @game, @gameGenre, @category, @description, @imageUrl, @downloadUrl, @author, @version, @createdBy,
         @storageKey, @fileName, @size)`,
    args: {
      ...mod,
      slug,
      createdBy,
      storageKey: upload?.storageKey ?? null,
      fileName: upload?.fileName ?? null,
      size: upload?.size ?? null,
    },
  });
  return Number(result.lastInsertRowid);
}

export async function getPendingMods(): Promise<SubmittedMod[]> {
  const db = await ensureDatabase();
  const result = await db.execute(`SELECT mods.*, mod_reviews.report_json AS review_json, mod_reviews.analyzed_at AS review_analyzed_at
      FROM mods LEFT JOIN mod_reviews ON mod_reviews.mod_id = mods.id
      WHERE mods.status = 'pending' ORDER BY mods.created_at ASC`);
  const rows = result.rows as unknown as (Record<string, unknown> & { status: ModStatus })[];
  return rows.map((row) => {
    let review: ModReview | null = null;
    if (typeof row.review_json === "string") {
      try {
        review = { ...(JSON.parse(row.review_json) as ModReview), analyzedAt: String(row.review_analyzed_at) };
      } catch (error) {
        console.error(`Failed to parse review for mod ${String(row.id)}:`, error);
      }
    }
    return {
      ...toMod(row),
      status: row.status,
      uploadedFileName: row.upload_file_name ? String(row.upload_file_name) : null,
      review,
    };
  });
}

export async function getPendingModForReview(id: number) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: "SELECT upload_storage_key, upload_file_name, description, title, game, category, version, download_url FROM mods WHERE id = ? AND status = 'pending'",
    args: [id],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    storageKey: row.upload_storage_key ? String(row.upload_storage_key) : null,
    fileName: row.upload_file_name ? String(row.upload_file_name) : null,
    title: String(row.title),
    game: String(row.game),
    category: String(row.category),
    version: row.version ? String(row.version) : null,
    description: String(row.description),
    downloadUrl: String(row.download_url),
  };
}

export async function getModForAdmin(id: number) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: `SELECT upload_storage_key, mirror_storage_key
      FROM mods WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  return row
    ? {
      storageKey: row.upload_storage_key ? String(row.upload_storage_key) : null,
      mirrorKey: row.mirror_storage_key ? String(row.mirror_storage_key) : null,
    }
    : null;
}

export async function deleteMod(id: number) {
  const db = await ensureDatabase();
  const result = await db.batch([
    { sql: "DELETE FROM mod_reviews WHERE mod_id = ?", args: [id] },
    { sql: "DELETE FROM mods WHERE id = ?", args: [id] },
  ], "write");
  return (result[1]?.rowsAffected ?? 0) > 0;
}

export async function saveModReview(id: number, report: ModReview) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: `INSERT INTO mod_reviews (mod_id, report_json, analyzed_at)
      SELECT id, ?, CURRENT_TIMESTAMP FROM mods WHERE id = ? AND status = 'pending'
      ON CONFLICT(mod_id) DO UPDATE SET report_json = excluded.report_json, analyzed_at = excluded.analyzed_at`,
    args: [JSON.stringify(report), id],
  });
  return result.rowsAffected > 0;
}

export async function setModStatus(id: number, status: Exclude<ModStatus, "pending">) {
  const db = await ensureDatabase();
  const result = await db.execute({
    sql: `UPDATE mods SET status = ?, upload_storage_key = NULL, upload_file_name = NULL, upload_size = NULL
      WHERE id = ? AND status = 'pending'`,
    args: [status, id],
  });
  return result.rowsAffected > 0;
}
