import test from "node:test";
import assert from "node:assert/strict";

import { isDirectFileUrl, resolveModDownload } from "../lib/download-sources.ts";

test("HTTPS archive URLs are recognized as direct downloads", () => {
  assert.equal(isDirectFileUrl("https://example.com/mod.zip"), true);
  assert.equal(isDirectFileUrl("http://example.com/mod.zip"), false);
  assert.equal(isDirectFileUrl("https://example.com/mod"), false);
});

test("A filename marks a direct HTTPS URL as a file download", () => {
  assert.equal(isDirectFileUrl("https://example.com/download?id=42", "mod-file"), true);
  assert.equal(isDirectFileUrl("https://example.com/download?id=42", " "), false);
});

test("Non-file links use the source page instead of provider-specific resolution", async () => {
  const result = await resolveModDownload({
    downloadUrl: "https://example.com/mod-page",
    sourceUrl: "https://example.com/source",
    downloadFileName: null,
    downloadSize: null,
  });
  assert.deepEqual(result, { status: "page", pageUrl: "https://example.com/source" });
});
