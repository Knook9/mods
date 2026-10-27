import { redirect } from "next/navigation";
import { adminEmail, getMemberSession, hasGoogleOAuthConfig } from "@/lib/auth";
import { genreLabels, getPendingMods, type ModReview } from "@/lib/db";
import AdminPanel from "./panel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "مراجعة الإرسالات | mode",
  robots: { index: false, follow: false },
};

function ReviewResult({ review }: { review: ModReview }) {
  const riskLabel = { low: "منخفض", medium: "متوسط", high: "مرتفع" }[review.risk];
  return <section className={`mod-review-result risk-${review.risk}`} aria-label="نتيجة الفحص">
    <div className="review-result-heading">
      <strong>نتيجة التحليل {review.engine === "gemini" ? "بمساعدة Google Gemini" : review.engine === "openai" ? "بمساعدة OpenAI" : "المحلي"}</strong>
      <span>مستوى المؤشرات: {riskLabel}</span>
    </div>
    <p>{review.summary}</p>
    <p>{review.recommendation}</p>
    <small>ملفات مصدر محللة: {review.scannedFiles} · ملفات لم تُحلّل: {review.omittedFiles}{review.model ? ` · النموذج: ${review.model}` : ""} · التوصية لا تتخذ قرارًا نيابةً عن المسؤول.</small>
    {review.findings.length > 0 && <ul>{review.findings.map((finding, index) => <li key={`${finding.title}-${index}`}><b>{finding.title} ({finding.severity})</b>: {finding.detail}</li>)}</ul>}
  </section>;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!hasGoogleOAuthConfig()) {
    return <div className="admin-wrap section-wrap"><div className="notice-card"><h1>إعداد تسجيل دخول Google مطلوب</h1><p>أضف <code>GOOGLE_CLIENT_ID</code> و<code>GOOGLE_CLIENT_SECRET</code> إلى <code>.env.local</code>، ثم أعد تشغيل الخادم. خطوات الإعداد في <code>README.md</code>.</p></div></div>;
  }
  const session = await getMemberSession();
  if (!session) {
    redirect(
      error
        ? `/login?error=${encodeURIComponent(error)}&callbackUrl=%2Fadmin`
        : "/login?callbackUrl=%2Fadmin",
    );
  }
  if (session.user?.email?.toLowerCase() !== adminEmail) redirect("/account");
  const pending = await getPendingMods();
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  return <div className="admin-wrap section-wrap"><div className="admin-heading"><div><span className="eyebrow dark-eyebrow">مساحة خاصة</span><h1>مراجعة الإرسالات</h1><p className="admin-review-note">التحليل توصية مساعدة فقط؛ افحص الملف بنفسك، وقرار النشر أو الرفض لك وحدك.</p></div><AdminPanel signedIn /></div>{!aiConfigured && <div className="ai-setup-notice" role="status"><strong>تحليل AI غير مفعّل بعد</strong><p>أضف مفتاح Google Gemini إلى <code>.env.local</code> بهذا الاسم: <code>GEMINI_API_KEY=...</code>، ثم أعد تشغيل الخادم. لا ترسل المفتاح في المحادثة.</p></div>}{pending.length ? <div className="pending-list">{pending.map((mod) => <article className="pending-card" key={mod.id}><div><span className="mod-game">{mod.game} · {genreLabels[mod.gameGenre] ?? mod.gameGenre} · {mod.category}</span><h2>{mod.title}</h2><p>{mod.description}</p><div className="pending-meta">بواسطة {mod.author}{mod.version ? ` · الإصدار ${mod.version}` : ""}</div><a href={mod.downloadUrl} target="_blank" rel="noopener noreferrer">رابط التنزيل ↗</a>{mod.imageUrl && <a href={mod.imageUrl} target="_blank" rel="noopener noreferrer"> · رابط الصورة ↗</a>}{mod.uploadedFileName && <div className="pending-meta">ملف مرفق: {mod.uploadedFileName}</div>}</div><AdminPanel modId={mod.id} uploadedFileName={mod.uploadedFileName} review={mod.review} aiConfigured={aiConfigured} />{mod.review && <ReviewResult review={mod.review} />}</article>)}</div> : <div className="empty-state admin-empty"><span className="empty-icon">✓</span><h3>لا توجد إرسالات معلّقة</h3><p>ستجد الإضافات الجديدة هنا لمراجعتها.</p></div>}</div>;
}
