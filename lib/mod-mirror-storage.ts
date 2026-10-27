import { createReadStream, createWriteStream } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const mirrorDirectory = path.resolve(process.env.MOD_MIRROR_DIR || "./data/mod-mirrors");

// الحد الأعلى لحجم ملف واحد يُستضاف على الخادم (4 غيغابايت).
export const MAX_MIRROR_BYTES = 4 * 1024 * 1024 * 1024;

// امتدادات الملفات الشائعة في المودات؛ تُستخدم لاسم التخزين فقط وليست قيدًا على المحتوى.
const allowedExtension = /\.(7z|zip|rar|tar|gz|tgz|bz2|xz|exe|dll|jar|pak|bin|dds|bsa|ba2|esm|esp|esl|mod|pbo|dat|nro|lua|json|cfg|conf|ini|toml|yaml|yml|txt|png|jpg|jpeg)$/i;

export function safeMirrorFileName(rawName: string) {
  const base = path.basename(String(rawName ?? "").replace(/\\/g, "/"));
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").trim();
  return cleaned.slice(0, 180) || "mod-file";
}

export function mirrorExtension(fileName: string) {
  const match = fileName.match(allowedExtension);
  return match ? match[0].toLowerCase() : ".bin";
}

export async function saveMirrorStream(body: ReadableStream<Uint8Array>, extension: string) {
  const storageKey = `${randomUUID()}${extension}`;
  await mkdir(mirrorDirectory, { recursive: true, mode: 0o700 });
  const target = path.join(mirrorDirectory, storageKey);
  await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(target, { flags: "wx", mode: 0o600 }));
  const info = await stat(target);
  return { storageKey, size: info.size };
}

// يتبنّى ملفًا نزّله المتصفح الآلي: ينقله إلى مجلد الاستضافة بمفتاح تخزين جديد.
export async function adoptMirrorFile(sourcePath: string, extension: string) {
  if (!/^\.[a-z0-9]{1,8}$/i.test(extension)) throw new Error("امتداد الملف غير صالح.");
  const storageKey = `${randomUUID()}${extension.toLowerCase()}`;
  await mkdir(mirrorDirectory, { recursive: true, mode: 0o700 });
  const target = path.join(mirrorDirectory, storageKey);
  try {
    await rename(sourcePath, target);
  } catch (error) {
    // قد يكون ملف التنزيل على قرص آخر؛ عندها ننسخ ثم نحذف الأصل.
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await copyFile(sourcePath, target, fsConstants.COPYFILE_EXCL);
    await rm(sourcePath, { force: true });
  }
  const info = await stat(target);
  return { storageKey, size: info.size };
}

export function parseByteRange(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart && rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function mirrorPath(storageKey: string) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(storageKey)) {
    throw new Error("معرّف النسخة المستضافة غير صالح.");
  }
  return path.join(mirrorDirectory, storageKey);
}

export async function statMirror(storageKey: string) {
  try {
    const info = await stat(mirrorPath(storageKey));
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

export function readMirrorRange(storageKey: string, start?: number, end?: number) {
  return createReadStream(mirrorPath(storageKey), start === undefined ? undefined : { start, end });
}

export async function removeMirror(storageKey: string) {
  await rm(mirrorPath(storageKey), { force: true });
}
