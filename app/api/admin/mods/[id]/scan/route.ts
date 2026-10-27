import { NextResponse } from "next/server";
import { adminEmail, isAdminSession } from "@/lib/auth";
import { getPendingModForReview, saveModReview } from "@/lib/db";
import { createModReview, emptyModInspection, inspectModUpload } from "@/lib/mod-review";
import { readModUpload } from "@/lib/mod-upload-storage";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const scanRateLimit = createRateLimiter(10, 60 * 60 * 1000);

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: `هذه العملية متاحة للمسؤول ${adminEmail} فقط.` }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });
  }
  const mod = await getPendingModForReview(id);
  if (!mod) return NextResponse.json({ error: "الإرسال غير موجود أو تمت مراجعته مسبقًا." }, { status: 404 });
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json({
      error: "تحليل Google Gemini غير مفعّل. أضف GEMINI_API_KEY إلى .env.local ثم أعد تشغيل الخادم.",
      code: "GEMINI_NOT_CONFIGURED",
    }, { status: 503 });
  }
  const retryAfter = scanRateLimit(adminEmail);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "تم بلوغ حد الفحوصات المسموح؛ حاول لاحقًا." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let inspection = emptyModInspection();
  if (mod.storageKey && mod.fileName) {
    try {
      const bytes = await readModUpload(mod.storageKey);
      inspection = inspectModUpload(bytes, mod.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر فحص الملف.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const metadata = {
    title: mod.title,
    game: mod.game,
    category: mod.category,
    version: mod.version,
    description: mod.description,
    downloadUrl: mod.downloadUrl,
  };
  let report;
  let warning: string | undefined;
  try {
    report = await createModReview(inspection, metadata);
    if (report.engine === "local") {
      warning = "لم يُضبط GEMINI_API_KEY؛ حُفظت نتيجة التحليل المحلي فقط.";
    }
  } catch (error) {
    console.error(`Google Gemini review failed for mod ${id}:`, error);
    report = await createModReview(inspection, metadata, false);
    const reason = error instanceof Error ? error.message.slice(0, 300) : "";
    warning = `تعذر إكمال تحليل Google Gemini؛ حُفظت نتيجة التحليل المحلي فقط.${reason ? ` (${reason})` : ""}`;
  }
  if (!(await saveModReview(id, report))) {
    return NextResponse.json({ error: "تعذر حفظ نتيجة الفحص؛ ربما تمت مراجعة الإرسال." }, { status: 409 });
  }
  return NextResponse.json({ report, warning });
}
