import fs from "node:fs";

let code = fs.readFileSync("lib/db.ts", "utf8");
const target = 'return Boolean(imageUrl && (imageUrl.includes("/images/") || imageUrl.includes("images.steamusercontent.com/ugc/")));';
const replacement = 'return Boolean(imageUrl && (imageUrl.includes("/images/") || imageUrl.includes("steamstatic.com") || imageUrl.includes("steamusercontent.com") || imageUrl.includes("unsplash.com") || imageUrl.includes(".r2.dev") || imageUrl.includes("cdn.")));';

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync("lib/db.ts", code);
  console.log("Updated isGalleryImage successfully!");
} else {
  console.log("Target not found!");
}
