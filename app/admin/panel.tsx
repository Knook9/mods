"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ModReview } from "@/lib/db";
import DeleteModButton from "./delete-mod-button";

export default function AdminPanel({
  signedIn = false,
  modId,
  uploadedFileName,
  review = null,
  aiConfigured = false,
}: {
  signedIn?: boolean;
  modId?: number;
  uploadedFileName?: string | null;
  review?: ModReview | null;
  aiConfigured?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function scan() {
    if (modId === undefined) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/mods/${modId}/scan`, { method: "POST" });
      const result = await response.json();
      if (result.report) router.refresh();
      if (!response.ok) throw new Error(result.error || "تعذر فحص الملف.");
      if (result.warning) setError(result.warning);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر فحص الملف.");
    } finally {
      setBusy(false);
    }
  }

  async function post(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تنفيذ الطلب.");
    } finally {
      setBusy(false);
    }
  }

  if (modId !== undefined) {
    return <div className="review-actions">
      {uploadedFileName && <a className="button button-outline" href={`/api/admin/mods/${modId}/file`}>تنزيل الملف للفحص</a>}
      <button className="button button-outline" disabled={busy || !aiConfigured} onClick={scan}>
        {busy ? "جارٍ تحليل AI..." : review ? "إعادة تحليل AI" : uploadedFileName ? "حلّل المود بالـAI" : "حلّل بيانات المود بالـAI"}
      </button>
      {!aiConfigured && <small role="status">AI غير مفعّل: أضف GEMINI_API_KEY إلى .env.local وأعد تشغيل الخادم.</small>}
      <button className="button button-accent" disabled={busy} onClick={() => post(`/api/admin/mods/${modId}`, { status: "approved" })}>قبول ونشر</button>
      <button className="button button-reject" disabled={busy} onClick={() => post(`/api/admin/mods/${modId}`, { status: "rejected" })}>رفض</button>
      <DeleteModButton modId={modId} />
      {error && <small role="alert">{error}</small>}
    </div>;
  }

  if (signedIn) return <button className="button button-outline" onClick={() => signOut({ callbackUrl: "/admin" })}>تسجيل الخروج</button>;

  return null;
}
