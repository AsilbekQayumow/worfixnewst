"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMe } from "@/components/providers";
import { Button, Notice, PasswordInput, TextInput } from "@/components/ui";
import type { SelfUser } from "@/lib/store/api";
import { homeForRole } from "@/lib/domain/permissions";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { DEMO_ACCOUNTS, FIREBASE } from "@/lib/store/db";

function Login() {
  const { t } = useI18n();
  const errText = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { reload } = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = (u: SelfUser) => {
    reload();
    if (u.role === "volunteer" && !u.onboarded) { router.replace("/app/onboarding"); return; }
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : homeForRole(u.role));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      done(await api.login({ email, password }));
    } catch (err) {
      if (err instanceof ValidationError) setFields(err.fields);
      else setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <div className="stack g12">
      <div className="stack g8">
        <h1 className="t-h1">{t("auth.loginTitle")}</h1>
        <p className="secondary">{t("auth.loginSub")}</p>
      </div>
    </div>
  );
  return (
    <form className="stack g20" onSubmit={submit} noValidate>
      {head}
      {error && <Notice tone="bad">{error}</Notice>}
      <TextInput label={t("auth.email")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
      <div className="stack g8">
        <PasswordInput label={t("auth.password")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
        <Link href="/forgot-password" className="link t-small" style={{ alignSelf: "flex-end" }}>{t("auth.forgot")}</Link>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={busy} block>{t("auth.login")}</Button>
      <p className="t-small secondary">{t("auth.noAccount")} <Link href="/register" className="link">{t("auth.register")}</Link></p>

      {!FIREBASE && (
        <div className="inset stack g8" style={{ padding: 16 }}>
          <span className="t-small" style={{ fontWeight: 500 }}>{t("auth.demoAccounts")}</span>
          <div className="row g8 wrap">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" className="chip" onClick={() => { setEmail(a.email); setPassword(a.password); }}>{t(`role.${a.label}`)}</button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><Login /></Suspense>;
}
