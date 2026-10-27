import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { getPendingModForReview } from "@/lib/db";
import { readModUpload } from "@/lib/mod-upload-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "هذه العملية متاحة للمسؤول فقط." }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });
  }
  const mod = await getPendingModForReview(id);
  if (!mod) return NextResponse.json({ error: "الإرسال غير موجود أو تمت مراجعته مسبقًا." }, { status: 404 });
  if (!mod.storageKey || !mod.fileName) {
    return NextResponse.json({ error: "لا يوجد ملف مرفق." }, { status: 404 });
  }
  try {
    const bytes = await readModUpload(mod.storageKey);
    const safeName = mod.fileName.replace(/[\u0000-\u001f\u007f"\\]/g, "_");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`Failed to read mod upload ${id}:`, error);
    return NextResponse.json({ error: "تعذر قراءة الملف المرفق." }, { status: 500 });
  }
}
