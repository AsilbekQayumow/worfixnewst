"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useMe } from "@/components/providers";
import { Button, Dialog, Notice, PasswordInput, TextInput } from "@/components/ui";
import { isNative, worfix, type NativeInfo } from "@/lib/native";
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
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // v5 (app): sign in with the fingerprint / Face ID; the password is kept encrypted on this phone only.
  const [bio, setBio] = useState<NativeInfo | null>(null);
  const [offer, setOffer] = useState<SelfUser | null>(null);
  useEffect(() => { if (isNative()) void worfix().then((w) => w.info()).then(setBio).catch(() => {}); }, []);
  const bioReady = bio !== null && bio.biometric !== "none";
  const bioText = { title: t("nt.bioTitle"), reason: t("nt.bioReason"), cancel: t("a.cancel") };

  const bioLogin = async () => {
    setError(null);
    let saved: { email: string; password: string };
    try {
      saved = await (await worfix()).loadLogin(bioText);
    } catch {
      setError(t("nt.bioFailed"));
      return;
    }
    setBusy(true);
    try {
      done(await api.login(saved));
    } catch (err) {
      await (await worfix()).clearLogin().catch(() => {});
      setBio((b) => (b ? { ...b, hasLogin: false } : b));
      setLogin(saved.email);
      setError(err instanceof ValidationError ? t("nt.bioStale") : errText(err));
    } finally {
      setBusy(false);
    }
  };

  const enableBio = async (u: SelfUser) => {
    try { await (await worfix()).saveLogin({ email: login, password, ...bioText }); } catch { /* declined at the prompt */ }
    setOffer(null);
    done(u);
  };
  const skipBio = (u: SelfUser) => {
    try { localStorage.setItem("worfix.bio.declined", "1"); } catch { /* ignore */ }
    setOffer(null);
    done(u);
  };

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
      const u = await api.login({ login, password });
      let declined = false;
      try { declined = localStorage.getItem("worfix.bio.declined") === "1"; } catch { /* ignore */ }
      if (bioReady && !bio?.hasLogin && !declined) setOffer(u);
      else done(u);
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
      {bioReady && bio?.hasLogin && (
        <Button type="button" variant="ink" size="lg" icon="key" block loading={busy} onClick={() => void bioLogin()}>
          {bio.biometric === "face" ? t("nt.faceLogin") : t("nt.bioLogin")}
        </Button>
      )}
      <Dialog open={offer !== null} onClose={() => offer && skipBio(offer)} title={t("nt.bioOffer")}
        footer={offer && <><Button variant="ghost" onClick={() => skipBio(offer)}>{t("nt.later")}</Button><Button variant="primary" icon="key" onClick={() => void enableBio(offer)}>{t("nt.bioEnable")}</Button></>}>
        <p className="secondary">{t("nt.bioOfferBody")}</p>
      </Dialog>
      <TextInput label={t("auth.loginName")} hint={t("auth.loginNameHint")} autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} error={fields.login} required />
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
              <button key={a.email} type="button" className="chip" onClick={() => { setLogin(a.username); setPassword(a.password); }}>{t(`role.${a.label}`)}</button>
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
