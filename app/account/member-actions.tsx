"use client";

import { signOut } from "next-auth/react";

export default function MemberActions() {
  return (
    <button className="button button-outline" onClick={() => signOut({ callbackUrl: "/" })}>
      تسجيل الخروج
    </button>
  );
}
