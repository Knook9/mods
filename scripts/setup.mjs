import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env.local");
let envContents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
envContents = envContents
  .split(/\r?\n/)
  .filter((line) => !line.startsWith("ADMIN_PASSWORD="))
  .join("\n");
function ensureSetting(name, value) {
  const setting = new RegExp(`^${name}=.*$`, "m");
  if (setting.test(envContents)) return false;
  envContents += `${envContents && !envContents.endsWith("\n") ? "\n" : ""}${name}=${value}\n`;
  return true;
}

const secretAdded = ensureSetting("NEXTAUTH_SECRET", randomBytes(32).toString("base64url"));
ensureSetting("NEXTAUTH_URL", "http://localhost:3000");
writeFileSync(envPath, envContents, { mode: 0o600 });
console.log("Local authentication settings are ready.");
if (secretAdded) console.log("A session secret was generated in .env.local.");
console.log("Add your Google OAuth client ID and secret to .env.local before signing in.");
console.log("Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env.local before opening the catalog.");
