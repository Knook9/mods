import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rm, stat, writeFile } from "node:fs/promises";

const tempDirectory = path.join(os.tmpdir(), `mode-mirror-test-${process.pid}-${Date.now()}`);
process.env.MOD_MIRROR_DIR = tempDirectory;

const {
  MAX_MIRROR_BYTES,
  adoptMirrorFile,
  mirrorExtension,
  parseByteRange,
  readMirrorRange,
  removeMirror,
  safeMirrorFileName,
  saveMirrorStream,
  statMirror,
} = await import("../lib/mod-mirror-storage.ts");

function streamOf(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test.after(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

test("Byte ranges support open, closed and suffix forms", () => {
  assert.deepEqual(parseByteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseByteRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange("bytes=900-5000", 1000), { start: 900, end: 999 });
});

test("Invalid ranges are rejected", () => {
  assert.equal(parseByteRange(null, 1000), null);
  assert.equal(parseByteRange("bytes=-", 1000), null);
  assert.equal(parseByteRange("bytes=1000-", 1000), null);
  assert.equal(parseByteRange("bytes=500-100", 1000), null);
  assert.equal(parseByteRange("items=0-10", 1000), null);
});

test("File names are stripped of paths and control characters", () => {
  assert.equal(safeMirrorFileName("../../etc/passwd"), "passwd");
  assert.equal(safeMirrorFileName("C:\\mods\\SkyUI 6.11.zip"), "SkyUI 6.11.zip");
  assert.equal(safeMirrorFileName('bad"name\u0000.zip'), "bad_name_.zip");
  assert.equal(safeMirrorFileName(""), "mod-file");
});

test("Mirror extensions are whitelisted", () => {
  assert.equal(mirrorExtension("SkyUI.zip"), ".zip");
  assert.equal(mirrorExtension("archive.7Z"), ".7z");
  assert.equal(mirrorExtension("unknown.exe.txt"), ".txt");
  assert.equal(mirrorExtension("script.dat"), ".dat");
  assert.equal(mirrorExtension("no-extension"), ".bin");
});

test("Stored files are streamed back unchanged", async () => {
  const saved = await saveMirrorStream(streamOf("hello mod"), ".zip");
  assert.equal(saved.size, 9);
  assert.match(saved.storageKey, /^[0-9a-f-]{36}\.zip$/);

  const info = await statMirror(saved.storageKey);
  assert.equal(info?.size, 9);

  assert.equal(await readStream(readMirrorRange(saved.storageKey)), "hello mod");
  assert.equal(await readStream(readMirrorRange(saved.storageKey, 0, 4)), "hello");
  assert.equal(await readStream(readMirrorRange(saved.storageKey, 6, 8)), "mod");

  await removeMirror(saved.storageKey);
  assert.equal(await statMirror(saved.storageKey), null);
});

test("Downloaded files are adopted into mirror storage", async () => {
  const downloadPath = path.join(tempDirectory, `download-${Date.now()}.zip`);
  const payload = "fetched from external source";
  await writeFile(downloadPath, payload);

  const adopted = await adoptMirrorFile(downloadPath, ".zip");
  assert.match(adopted.storageKey, /^[0-9a-f-]{36}\.zip$/);
  assert.equal(adopted.size, Buffer.byteLength(payload));
  assert.equal(await readStream(readMirrorRange(adopted.storageKey)), payload);
  await assert.rejects(() => stat(downloadPath));

  await removeMirror(adopted.storageKey);
  assert.equal(await statMirror(adopted.storageKey), null);
});

test("Adoption refuses extensions that are not simple suffixes", async () => {
  const downloadPath = path.join(tempDirectory, `download-bad-${Date.now()}.zip`);
  await writeFile(downloadPath, "x");
  await assert.rejects(() => adoptMirrorFile(downloadPath, "../zip"), /غير صالح/);
  assert.equal((await stat(downloadPath)).size, 1);
});

test("Storage keys outside the generated pattern are refused", async () => {
  await assert.rejects(async () => readMirrorRange("../../secret.zip"), /غير صالح/);
  await assert.rejects(() => removeMirror("../x.zip"), /غير صالح/);
});

test("The size limit matches the documented 4 GB", () => {
  assert.equal(MAX_MIRROR_BYTES, 4 * 1024 * 1024 * 1024);
});
