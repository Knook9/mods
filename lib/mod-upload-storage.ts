import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const uploadDirectory = path.resolve(process.env.MOD_UPLOAD_DIR || "./data/mod-uploads");

export async function saveModUpload(bytes: Buffer, extension: string) {
  const storageKey = `${randomUUID()}${extension}`;
  await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadDirectory, storageKey), bytes, { flag: "wx", mode: 0o600 });
  return storageKey;
}

function uploadPath(storageKey: string) {
  if (!/^[0-9a-f-]{36}\.(?:zip|cs|cfg|conf|ini|java|js|json|lua|md|properties|py|sh|toml|ts|txt|xml|yaml|yml)$/i.test(storageKey)) {
    throw new Error("معرّف ملف المود المخزن غير صالح.");
  }
  return path.join(uploadDirectory, storageKey);
}

export function readModUpload(storageKey: string) {
  return readFile(uploadPath(storageKey));
}

export async function removeModUpload(storageKey: string) {
  await rm(uploadPath(storageKey), { force: true });
}
