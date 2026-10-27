import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const categoryImages = {
  "الرسوميات والتظليل": "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80",
  "الرسوميات": "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80",
  "تحسين الأداء": "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80",
  "أسلحة ومعدات": "https://images.unsplash.com/photo-1589241062272-c0a000072dfa?auto=format&fit=crop&w=600&q=80",
  "أدوات": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  "أدوات ومساعدات": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  "إدارة المخزون": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  "خرائط وعوالم جديدة": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
  "عوالم جديدة": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
  "تحسينات اللعب": "https://images.unsplash.com/photo-1612287232219-54b9d0337d18?auto=format&fit=crop&w=600&q=80",
  "أزياء وتجميل": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80",
  "صوتيات وموسيقى": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80",
  "مكتبات مطلوبة": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80",
  "شخصيات جديدة": "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=600&q=80",
  "واجهة المستخدم": "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80",
  "بناء واستكشاف": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "الاستكشاف": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "أعداء ومخاطر": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "إضافات متنوعة": "https://images.unsplash.com/photo-1612287232219-54b9d0337d18?auto=format&fit=crop&w=600&q=80"
};

async function updateCategoryImages() {
  console.log("Updating category images across all mods in Turso...");
  for (const [cat, img] of Object.entries(categoryImages)) {
    const res = await client.execute({
      sql: "UPDATE mods SET image_url = ? WHERE category = ? AND (image_url IS NULL OR image_url = '')",
      args: [img, cat]
    });
    console.log(`Category: ${cat} -> Updated ${res.rowsAffected} rows`);
  }

  // Fallback for any remaining mods without images
  const fallback = await client.execute({
    sql: "UPDATE mods SET image_url = ? WHERE image_url IS NULL OR image_url = ''",
    args: ["https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80"]
  });
  console.log("Fallback updated remaining:", fallback.rowsAffected);

  const check = await client.execute("SELECT COUNT(*) as total_with_img FROM mods WHERE image_url IS NOT NULL AND image_url != ''");
  console.log("SUCCESS! Total mods with images now:", check.rows[0]);
}

updateCategoryImages().catch(console.error);
