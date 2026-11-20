"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Notice, TextInput } from "@/components/ui";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";

export default function Forgot() {
  const { t } = useI18n();
  const errText = useErrorText();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack g20" noValidate onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try { const r = await api.requestPasswordReset(email); setDev(r.devResetToken); setSent(true); } catch (err) { setError(errText(err)); } finally { setBusy(false); }
    }}>
      <div className="stack g8">
        <h1 className="t-h1">{t("auth.forgotTitle")}</h1>
        <p className="secondary">{t("auth.forgotSub")}</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {sent ? (
        <Notice tone="ok">
          {t("auth.resetSent")}
          {dev && <> <Link className="link" href={`/reset-password?token=${dev}`}>{t("auth.devResetLink")}</Link></>}
        </Notice>
      ) : (
        <>
          <TextInput label={t("auth.email")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" loading={busy} block>{t("auth.sendReset")}</Button>
        </>
      )}
      <Link href="/login" className="link t-small">{t("auth.backToLogin")}</Link>
    </form>
  );
}
