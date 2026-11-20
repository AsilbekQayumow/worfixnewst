"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMe } from "@/components/providers";
import { Button, Notice } from "@/components/ui";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { FIREBASE } from "@/lib/store/db";

function Verify() {
  const { t } = useI18n();
  const errText = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const { me, reload } = useMe();
  const [dev, setDev] = useState(params.get("dev"));
  const next = params.get("next") ?? "/app";
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  const run = async (k: string, fn: () => Promise<void>) => {
    setBusy(k); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ tone: "bad", text: errText(e) }); } finally { setBusy(null); }
  };

  return (
    <div className="stack g20">
      <div className="stack g8">
        <h1 className="t-h1">{t("auth.verifyTitle")}</h1>
        <p className="secondary">{t("auth.verifySub", { email: me?.email ?? "" })}</p>
      </div>
      {me?.emailVerified && <Notice tone="ok">{t("auth.verified")}</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!me?.emailVerified && (
        <div className="stack g12">
          {!FIREBASE && dev && (
            <Notice tone="info">
              {t("auth.devVerify")}{" "}
              <button type="button" className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                onClick={() => run("dev", async () => { await api.verifyEmail(dev); reload(); setDev(null); setMsg({ tone: "ok", text: t("auth.verified") }); })}>
                {t("auth.devVerifyLink")}
              </button>
            </Notice>
          )}
          {FIREBASE && (
            <Button variant="primary" loading={busy === "check"} onClick={() => run("check", async () => {
              const ok = await api.refreshEmailVerified();
              reload();
              setMsg(ok ? { tone: "ok", text: t("auth.verified") } : { tone: "info", text: t("auth.notYet") });
            })}>{t("auth.iVerified")}</Button>
          )}
          <Button loading={busy === "resend"} onClick={() => run("resend", async () => {
            const r = await api.resendVerification();
            if (r.devVerifyToken) setDev(r.devVerifyToken);
            setMsg({ tone: "info", text: t("auth.resent") });
          })}>{t("auth.resend")}</Button>
        </div>
      )}
      <Button variant={me?.emailVerified ? "primary" : "ghost"} onClick={() => router.replace(safeNext)}>{me?.emailVerified ? t("a.continue") : t("auth.later")}</Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><Verify /></Suspense>;
}
