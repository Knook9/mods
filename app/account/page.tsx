import { redirect } from "next/navigation";
import { getMemberSession, isAdminSession } from "@/lib/auth";
import MemberActions from "./member-actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getMemberSession();
  if (!session?.user?.email) redirect("/login?callbackUrl=%2Faccount");
  const isAdmin = await isAdminSession();

  return (
    <div className="form-page section-wrap">
      <div className="admin-login member-login account-card">
        <span className="login-symbol">م</span>
        <span className="eyebrow dark-eyebrow member-eyebrow">حساب العضو</span>
        <h1>أهلًا {session.user.name || "بك"}</h1>
        <p className="account-email" dir="ltr">{session.user.email}</p>
        {isAdmin && (
          <div className="admin-account">
            <strong>حساب المسؤول</strong>
            <a href="/admin">فتح لوحة مراجعة الإرسالات ↗</a>
          </div>
        )}
        <p>أصبح حسابك جاهزًا. يمكنك إرسال موداتك للمراجعة ومتابعة إضافات المجتمع.</p>
        <div className="account-actions">
          <a className="button button-accent" href="/submit">أرسل مودًا <span aria-hidden="true">↗</span></a>
          <MemberActions />
        </div>
      </div>
    </div>
  );
}
