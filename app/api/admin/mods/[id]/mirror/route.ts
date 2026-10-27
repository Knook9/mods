import { NextResponse } from "next/server";
import { adminEmail, isAdminSession } from "@/lib/auth";
import { getModForAdmin, setModMirror } from "@/lib/db";
import {
  MAX_MIRROR_BYTES,
  mirrorExtension,
  removeMirror,
  safeMirrorFileName,
  saveMirrorStream,
} from "@/lib/mod-mirror-storage";

export const runtime = "nodejs";
export const maxDuration = 600;

async function getModId(params: Promise<{ id: string }>) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function decodeFileName(header: string | null) {
  const raw = header ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: `هذه العملية متاحة للمسؤول ${adminEmail} فقط.` }, { status: 403 });
  }
  const id = await getModId(params);
  if (id === null) return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });

  const mod = await getModForAdmin(id);
  if (!mod) return NextResponse.json({ error: "المود غير موجود." }, { status: 404 });
  if (!request.body) return NextResponse.json({ error: "لم يصل ملف." }, { status: 400 });

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_MIRROR_BYTES) {
    return NextResponse.json({ error: "حجم الملف يتجاوز الحد المسموح (4 غيغابايت)." }, { status: 413 });
  }

  const fileName = safeMirrorFileName(decodeFileName(request.headers.get("x-file-name")));
  let saved: { storageKey: string; size: number };
  try {
    saved = await saveMirrorStream(request.body, mirrorExtension(fileName));
  } catch (error) {
    console.error(`Failed to store mirror for mod ${id}:`, error);
    return NextResponse.json({ error: "تعذر حفظ الملف على الخادم." }, { status: 500 });
  }

  if (saved.size === 0 || saved.size > MAX_MIRROR_BYTES) {
    await removeMirror(saved.storageKey).catch((error) => console.error("Failed to remove rejected mirror:", error));
    return NextResponse.json(
      { error: saved.size === 0 ? "الملف فارغ." : "حجم الملف يتجاوز الحد المسموح (4 غيغابايت)." },
      { status: 413 },
    );
  }

  if (!(await setModMirror(id, { storageKey: saved.storageKey, fileName, size: saved.size }))) {
    await removeMirror(saved.storageKey).catch((error) => console.error("Failed to remove orphaned mirror:", error));
    return NextResponse.json({ error: "تعذر ربط الملف بالمود." }, { status: 404 });
  }

  if (mod.mirrorKey && mod.mirrorKey !== saved.storageKey) {
    await removeMirror(mod.mirrorKey).catch((error) => console.error("Failed to remove replaced mirror:", error));
  }

  return NextResponse.json({ message: "تمت استضافة الملف.", fileName, size: saved.size });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: `هذه العملية متاحة للمسؤول ${adminEmail} فقط.` }, { status: 403 });
  }
  const id = await getModId(params);
  if (id === null) return NextResponse.json({ error: "معرّف المود غير صالح." }, { status: 400 });

  const mod = await getModForAdmin(id);
  if (!mod) return NextResponse.json({ error: "المود غير موجود." }, { status: 404 });

  await setModMirror(id, null);
  if (mod.mirrorKey) {
    await removeMirror(mod.mirrorKey).catch((error) => console.error("Failed to remove mirror file:", error));
  }
  return NextResponse.json({ message: "تمت إزالة النسخة المستضافة." });
}
