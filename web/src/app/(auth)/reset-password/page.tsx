"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Notice, PasswordInput } from "@/components/ui";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { FIREBASE } from "@/lib/store/db";

function Reset() {
  const { t } = useI18n();
  const errText = useErrorText();
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [field, setField] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (FIREBASE) return <Notice tone="info">{t("auth.resetFirebase")} <Link className="link" href="/login">{t("auth.login")}</Link></Notice>;

  return (
    <form className="stack g20" noValidate onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError(null); setField(undefined);
      try { await api.resetPassword(token, pw); setDone(true); }
      catch (err) { if (err instanceof ValidationError) setField(err.fields.password); else setError(errText(err)); }
      finally { setBusy(false); }
    }}>
      <h1 className="t-h1">{t("auth.resetTitle")}</h1>
      {error && <Notice tone="bad">{error}</Notice>}
      {done ? (
        <Notice tone="ok">{t("auth.resetDone")} <Link className="link" href="/login">{t("auth.login")}</Link></Notice>
      ) : (
        <>
          <PasswordInput label={t("auth.newPassword")} autoComplete="new-password" hint={t("auth.passwordHint")} value={pw} onChange={(e) => setPw(e.target.value)} error={field} />
          <Button type="submit" variant="primary" size="lg" loading={busy} block disabled={!token}>{t("auth.savePassword")}</Button>
        </>
      )}
    </form>
  );
}

export default function ResetPage() {
  return <Suspense fallback={null}><Reset /></Suspense>;
}
