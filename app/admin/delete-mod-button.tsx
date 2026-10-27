"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteModButton({
  modId,
  returnToCatalog = false,
}: {
  modId: number;
  returnToCatalog?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function remove() {
    if (!window.confirm("هل أنت متأكد من حذف هذا المود نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/mods/${modId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حذف المود.");
      if (returnToCatalog) router.push("/");
      else router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حذف المود.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="button button-reject" type="button" disabled={busy} onClick={remove}>
      {busy ? "جارٍ الحذف..." : "حذف المود"}
    </button>
    {error && <small className="delete-mod-error" role="alert">{error}</small>}
  </>;
}
