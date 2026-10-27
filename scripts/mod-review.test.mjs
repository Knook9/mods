import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { createModReview, inspectModUpload } from "../lib/mod-review.ts";

function zipFile(name, content, { flags = 0 } = {}) {
  const nameBytes = Buffer.from(name);
  const source = Buffer.from(content);
  const compressed = deflateRawSync(source);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + compressed.length, 16);
  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, end]);
}

test("source files are scanned for suspicious indicators without execution", () => {
  const result = inspectModUpload(Buffer.from("const x = atob(payload); eval(x);"), "mod.js");
  assert.equal(result.scannedFiles, 1);
  assert.ok(result.findings.some((finding) => finding.title === "فك ترميز يتبعه تنفيذ"));
});

test("ZIP source files are read and scanned in memory", () => {
  const result = inspectModUpload(zipFile("src/mod.cs", "Process.Start(\"tool\");"), "submission.zip");
  assert.equal(result.scannedFiles, 1);
  assert.ok(result.findings.some((finding) => finding.title === "تشغيل أوامر النظام"));
});

test("ZIP path traversal and encrypted archives are rejected", () => {
  assert.throws(() => inspectModUpload(zipFile("../mod.js", "code"), "bad.zip"), /مسار ملف غير آمن/);
  assert.throws(() => inspectModUpload(zipFile("mod.js", "code", { flags: 1 }), "locked.zip"), /مشفّر/);
});

test("ZIP decompression ratio is bounded", () => {
  assert.throws(() => inspectModUpload(zipFile("large.txt", "A".repeat(1024 * 1024)), "bomb.zip"), /حدود فك الضغط/);
});

test("local-only report is explicit and never makes a publish decision", async () => {
  const inspection = inspectModUpload(Buffer.from("plain source"), "mod.txt");
  const report = await createModReview(inspection, {
    title: "Example",
    game: "Game",
    category: "Tools",
    version: null,
  }, false);
  assert.equal(report.engine, "local");
  assert.match(report.summary, /لم يُضبط مفتاح Google Gemini/);
  assert.match(report.recommendation, /يدويًا/);
});

test("Google Gemini Interactions API uses configured model and parses its JSON response", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_REVIEW_MODEL = "test-model";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({
        risk: "low",
        summary: "تحليل تجريبي",
        recommendation: "راجع النتيجة يدويًا",
        findings: [],
      }) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const report = await createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
      title: "Example",
      game: "Game",
      category: "Tools",
      version: null,
    });
    assert.equal(report.engine, "gemini");
    assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(request.options.headers["x-goog-api-key"], "test-gemini-key");
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, "test-model");
    assert.equal(body.store, false);
    assert.equal(body.generation_config.max_output_tokens, 4096);
    assert.equal(typeof body.system_instruction, "string");
    assert.equal(typeof body.input, "string");
    assert.equal(report.model, "test-model");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
  }
});

function geminiSuccess(model) {
  return new Response(JSON.stringify({
    status: "completed",
    model,
    steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({
      risk: "low",
      summary: "تحليل تجريبي",
      recommendation: "راجع النتيجة يدويًا",
      findings: [],
    }) }] }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Google Gemini falls back to the next configured model when one is unavailable", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_REVIEW_MODEL = "busy-model, backup-model, extra-model";
  const called = [];
  globalThis.fetch = async (_url, options) => {
    const model = JSON.parse(options.body).model;
    called.push(model);
    if (model === "busy-model") {
      return new Response(JSON.stringify({ error: { message: "high demand", code: "service_unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return geminiSuccess(model);
  };

  try {
    const report = await createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
      title: "Example",
      game: "Game",
      category: "Tools",
      version: null,
    });
    assert.equal(report.engine, "gemini");
    assert.equal(report.model, "backup-model");
    assert.deepEqual(called, ["busy-model", "backup-model"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
  }
});

test("Google Gemini report parsing tolerates code fences, capitalized risk, and text findings", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFallback = process.env.GEMINI_FALLBACK_MODELS;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_REVIEW_MODEL = "fenced-model";
  process.env.GEMINI_FALLBACK_MODELS = "";
  const fenced = "```json\n" + JSON.stringify({
    risk: "Medium",
    summary: "ملخص",
    recommendation: "توصية",
    findings: ["ملاحظة نصية"],
  }) + "\n```";
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "text", text: fenced }] }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const report = await createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
      title: "Example",
      game: "Game",
      category: "Tools",
      version: null,
    });
    assert.equal(report.risk, "medium");
    assert.equal(report.findings[0].severity, "medium");
    assert.equal(report.findings[0].title, "ملاحظة نصية");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = previousFallback;
  }
});

test("Google Gemini moves past a model whose daily quota is exhausted", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFallback = process.env.GEMINI_FALLBACK_MODELS;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_REVIEW_MODEL = "capped-model, healthy-model";
  process.env.GEMINI_FALLBACK_MODELS = "";
  const called = [];
  globalThis.fetch = async (_url, options) => {
    const model = JSON.parse(options.body).model;
    called.push(model);
    if (model === "capped-model") {
      return new Response(JSON.stringify({
        error: {
          message: "Rate limit exceeded for model capped-model (limit: 20 requests per day on Free Tier). Please retry in 16h44m12s.",
          code: "too_many_requests",
        },
      }), { status: 429, headers: { "Content-Type": "application/json" } });
    }
    return geminiSuccess(model);
  };

  try {
    const report = await createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
      title: "Example",
      game: "Game",
      category: "Tools",
      version: null,
    });
    assert.equal(report.model, "healthy-model");
    assert.deepEqual(called, ["capped-model", "healthy-model"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = previousFallback;
  }
});

test("an exhausted model is skipped on later runs and the wait time is reported", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFallback = process.env.GEMINI_FALLBACK_MODELS;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_REVIEW_MODEL = "daily-capped-model";
  process.env.GEMINI_FALLBACK_MODELS = "";
  const called = [];
  globalThis.fetch = async () => {
    called.push("call");
    return new Response(JSON.stringify({
      error: {
        message: "Rate limit exceeded for model daily-capped-model (limit: 20 requests per day on Free Tier). Please retry in 16h44m12s.",
        code: "too_many_requests",
      },
    }), { status: 429, headers: { "Content-Type": "application/json" } });
  };

  try {
    await assert.rejects(
      createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
        title: "Example", game: "Game", category: "Tools", version: null,
      }),
      /حد الاستخدام اليومي/,
    );
    assert.equal(called.length, 1);

    // محاولة ثانية: يجب ألا يلمس النموذج المستنفد إطلاقًا.
    await assert.rejects(
      createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
        title: "Example", game: "Game", category: "Tools", version: null,
      }),
      /حد الاستخدام اليومي/,
    );
    assert.equal(called.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = previousFallback;
  }
});

test("Google Gemini stops immediately on an authentication failure", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_REVIEW_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "bad-key";
  process.env.GEMINI_REVIEW_MODEL = "first-model, second-model";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "API key not valid", code: 400 } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      createModReview(inspectModUpload(Buffer.from("source"), "mod.txt"), {
        title: "Example",
        game: "Game",
        category: "Tools",
        version: null,
      }),
      /HTTP 403/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_REVIEW_MODEL;
    else process.env.GEMINI_REVIEW_MODEL = previousModel;
  }
});
