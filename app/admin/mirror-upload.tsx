"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MirrorState = { fileName: string; size: number } | null;
type BusyMode = "upload" | "remove" | null;

function formatSize(size: number) {
  if (!size) return "";
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} غيغابايت`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} ميجابايت`;
  return `${Math.max(1, Math.ceil(size / 1024))} كيلوبايت`;
}

export default function MirrorUpload({
  modId,
  fileName,
  size,
}: {
  modId: number;
  fileName: string | null;
  size: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<MirrorState>(fileName ? { fileName, size: size ?? 0 } : null);
  const [busy, setBusy] = useState<BusyMode>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function upload(file: File) {
    setBusy("upload");
    setError(null);
    setNotice(null);
    setProgress(0);

    const request = new XMLHttpRequest();
    request.open("POST", `/api/admin/mods/${modId}/mirror`);
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setBusy(null);
      let payload: { error?: string; fileName?: string; size?: number } = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300 && payload.fileName) {
        setCurrent({ fileName: payload.fileName, size: payload.size ?? 0 });
        setProgress(100);
        router.refresh();
      } else {
        setError(payload.error ?? "تعذر رفع الملف.");
      }
    };
    request.onerror = () => {
      setBusy(null);
      setError("تعذر الاتصال بالخادم أثناء الرفع.");
    };
    request.send(file);
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/mods/${modId}/mirror`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "تعذر حذف النسخة المستضافة.");
      } else {
        setCurrent(null);
        setProgress(0);
        router.refresh();
      }
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mirror-panel">
      <div className="mirror-head">
        <strong>استضافة الملف على الخادم</strong>
        <span className={current ? "mirror-status hosted" : "mirror-status"}>
          {current ? `${current.fileName}${current.size ? ` · ${formatSize(current.size)}` : ""}` : "غير مستضاف"}
        </span>
      </div>
      <p className="mirror-hint">
        ارفع ملفًا تملك حق استضافته ليصبح زر التحميل العام مباشرًا من نطاق الموقع.
      </p>
      <div className="mirror-actions">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload(file);
          }}
        />
        <button
          type="button"
          className="button button-dark"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "upload"
            ? progress > 0
              ? `جارٍ الرفع ${progress}%`
              : "جارٍ الرفع…"
            : current
              ? "استبدال الملف"
              : "اختر ملف المود"}
        </button>
        {current && (
          <button type="button" className="button button-reject" onClick={remove} disabled={busy !== null}>
            {busy === "remove" ? "جارٍ الإزالة…" : "إزالة النسخة"}
          </button>
        )}
      </div>
      {busy === "upload" && progress > 0 && (
        <div className="mirror-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {notice && <small className="mirror-notice">{notice}</small>}
      {error && <small className="form-error mirror-error">{error}</small>}
    </div>
  );
}
