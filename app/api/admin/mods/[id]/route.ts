import { NextResponse } from "next/server";
import { adminEmail, isAdminSession } from "@/lib/auth";
import { deleteMod, getModForAdmin, getPendingModForReview, setModStatus } from "@/lib/db";
import { removeModUpload } from "@/lib/mod-upload-storage";

export const runtime = "nodejs";

async function getModId(params: Promise<{ id: string }>) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: `هذه العملية متاحة للمسؤول ${adminEmail} فقط.` }, { status: 403 });
  }
  const id = await getModId(params);
  if (id === null) return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });

  const mod = await getModForAdmin(id);
  if (!mod || !(await deleteMod(id))) {
    return NextResponse.json({ error: "المود غير موجود أو حُذف مسبقًا." }, { status: 404 });
  }
  if (mod.storageKey) {
    try {
      await removeModUpload(mod.storageKey);
    } catch (error) {
      console.error(`Failed to remove deleted mod upload ${id}:`, error);
    }
  }
  return NextResponse.json({ message: "تم حذف المود." });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: `هذه العملية متاحة للمسؤول ${adminEmail} فقط.` }, { status: 403 });
  }
  const id = await getModId(params);
  if (id === null) return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "الطلب غير صالح." }, { status: 400 });
  }
  const status = body && typeof body === "object" && "status" in body ? body.status : undefined;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "حالة المراجعة غير صالحة." }, { status: 400 });
  }
  const pendingMod = await getPendingModForReview(id);
  if (!pendingMod || !(await setModStatus(id, status))) {
    return NextResponse.json({ error: "الإرسال غير موجود أو تمت مراجعته مسبقًا." }, { status: 404 });
  }
  if (pendingMod.storageKey) {
    try {
      await removeModUpload(pendingMod.storageKey);
    } catch (error) {
      console.error(`Failed to remove reviewed mod upload ${id}:`, error);
    }
  }
  return NextResponse.json({ message: status === "approved" ? "تم نشر المود." : "تم رفض المود." });
}
