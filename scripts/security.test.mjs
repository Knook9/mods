import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config.ts";
import { createRateLimiter } from "../lib/rate-limit.ts";
import { validateSubmission } from "../lib/validation.ts";

const validSubmission = {
  title: "اختبار",
  game: "Minecraft",
  gameGenre: "Sandbox",
  category: "أدوات",
  description: "وصف",
  imageUrl: "",
  downloadUrl: "https://example.com/mod",
  author: "عضو",
  version: "",
};

test("submission links require HTTPS", () => {
  assert.ok("value" in validateSubmission(validSubmission));
  assert.ok("error" in validateSubmission({ ...validSubmission, downloadUrl: "http://example.com/mod" }));
  assert.ok("error" in validateSubmission({ ...validSubmission, downloadUrl: "javascript:alert(1)" }));
  assert.ok("error" in validateSubmission({ ...validSubmission, downloadUrl: "https://user:pass@example.com/mod" }));
  assert.ok("error" in validateSubmission({ ...validSubmission, imageUrl: "http://example.com/image.png" }));
});

test("submission rate limit allows five requests per window and then resets", () => {
  const limit = createRateLimiter(5, 60_000);
  for (let i = 0; i < 5; i += 1) assert.equal(limit("member@example.com", 1000), null);
  assert.equal(limit("member@example.com", 1000), 60);
  assert.equal(limit("other@example.com", 1000), null);
  assert.equal(limit("member@example.com", 61_000), null);
});

test("security response headers are configured", async () => {
  const rules = await config.headers();
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["strict-transport-security"], "max-age=31536000");
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(config.poweredByHeader, false);
});
