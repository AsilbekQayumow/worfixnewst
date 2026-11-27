"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LANGS, PRIVACY_MODES, type PrivacyMode } from "@/lib/domain/types";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { FIREBASE } from "@/lib/store/db";
import { isNative } from "@/lib/native";
import { AppSettings } from "./app-settings";
import { NotifySettings, SkillsSettings } from "./settings-v6";
import { Icon, type IconName } from "./icons";
import { LANG_LABEL } from "./lang-switch";
import { ProfileForm } from "./profile-form";
import { useMe, useTheme } from "./providers";
import { useInstall } from "./pwa";
import { PageHead } from "./shell";
import { Button, Checkbox, Dialog, Notice, PasswordInput, Segmented, TextInput, useToast } from "./ui";

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="settings-row">
      <div className="stack g4">
        <h2 className="t-h3">{title}</h2>
        {sub && <p className="t-small secondary">{sub}</p>}
      </div>
      <div className="card pad-lg">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { me, reload } = useMe();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const pwa = useInstall();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNative()), []);

  const [personal, setPersonal] = useState(() => ({
    phone: me?.phone ?? "", birthYear: me?.birthYear ? String(me.birthYear) : "", privacy: (me?.privacy ?? "public") as PrivacyMode, feedVisible: me?.feedVisible ?? true,
  }));
  const [pFields, setPFields] = useState<Record<string, string>>({});
  const [savingP, setSavingP] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwFields, setPwFields] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);

  const [del, setDel] = useState(false);
  const [delText, setDelText] = useState("");

  if (!me) return null;
  const volunteer = me.role === "volunteer";

  const savePersonal = async (patch?: Partial<typeof personal>) => {
    const next = { ...personal, ...patch };
    setPersonal(next);
    setSavingP(true); setPFields({});
    try {
      await api.updatePersonal({ phone: next.phone, birthYear: next.birthYear ? Number(next.birthYear) : null, language: lang, privacy: next.privacy, feedVisible: next.feedVisible });
      reload();
      toast(t("set.saved"));
    } catch (e) {
      if (e instanceof ValidationError) setPFields(e.fields); else toast(errText(e), "error");
    } finally { setSavingP(false); }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFields({});
    if (pw.next !== pw.confirm) { setPwFields({ confirm: "v.passwordMatch" }); return; }
    setSavingPw(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast(t("set.pwChanged"));
    } catch (err) {
      if (err instanceof ValidationError) setPwFields(err.fields); else toast(errText(err), "error");
    } finally { setSavingPw(false); }
  };

  const privacyIcon: Record<PrivacyMode, IconName> = { public: "globe", friends: "users", private: "lock" };
  const nav = [
    ["language", t("set.language")], ...(volunteer ? [["profile", t("set.profile")]] : []), ["personal", t("set.personal")],
    ...(volunteer ? [["privacy", t("set.privacy")]] : []), ["password", t("set.password")], ["data", t("set.data")],
  ];

  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.settings")} />
      <nav className="row g8 wrap chip-scroll" aria-label={t("nav.settings")}>
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="chip">{label}</a>)}
      </nav>

      <Section id="language" title={t("set.language")} sub={t("set.languageSub")}>
        <div className="stack g16">
          <div className="grid cols-3" role="radiogroup" aria-label={t("set.language")}>
            {LANGS.map((l) => (
              <label key={l} className="radio-card" data-on={lang === l} style={{ position: "relative" }} lang={l}>
                <input type="radio" name="lang" checked={lang === l} onChange={() => { setLang(l); toast(t("set.saved")); }} />
                <span style={{ fontWeight: 500 }}>{LANG_LABEL[l]}</span>
              </label>
            ))}
          </div>
          <div className="row between g12 wrap">
            <span className="secondary t-small">{t("set.theme")}</span>
            <Segmented value={theme} onChange={(v) => { if (v !== theme) toggle(); }} items={[{ value: "light", label: t("set.light") }, { value: "dark", label: t("set.dark") }]} />
          </div>
        </div>
      </Section>

      {native ? (
        <Section id="app" title={t("nt.appSection")}>
          <AppSettings />
        </Section>
      ) : <Section id="install" title={t("set.install")} sub={t("set.installSub")}>
        {pwa.state === "ready" ? <Button variant="primary" icon="download" onClick={() => void pwa.install()}>{t("set.installBtn")}</Button>
          : <p className="t-small secondary">{pwa.state === "installed" ? t("set.installed") : pwa.state === "ios" ? t("set.installIos") : t("set.installManual")}</p>}
      </Section>}

      {volunteer && (
        <Section id="profile" title={t("set.profile")} sub={t("set.profileSub")}>
          <ProfileForm me={me} onSaved={reload} />
        </Section>
      )}

      <Section id="personal" title={t("set.personal")} sub={t("set.personalSub")}>
        <form className="stack g16" onSubmit={(e) => { e.preventDefault(); void savePersonal(); }} noValidate>
          {me.email
            ? <TextInput label={t("auth.email")} value={me.email} readOnly hint={me.emailVerified ? t("set.emailVerified") : t("set.emailNotVerified")} />
            : <TextInput label={me.telegramId ? "Telegram" : t("auth.phone")} value={me.telegramId ? `ID ${me.telegramId}` : me.phone ?? ""} readOnly hint={t("set.signInWith", { m: me.telegramId ? "Telegram" : t("auth.byPhone") })} />}
          <div className="grid cols-2">
            <TextInput label={t("set.phone")} type="tel" placeholder="+998 90 123 45 67" value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} error={pFields.phone} autoComplete="tel" />
            <TextInput label={t("auth.birthYear")} inputMode="numeric" value={personal.birthYear} onChange={(e) => setPersonal({ ...personal, birthYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} error={pFields.birthYear} />
          </div>
          <p className="t-small muted">{t("set.personalPrivate")}</p>
          <div><Button type="submit" variant="primary" loading={savingP}>{t("a.save")}</Button></div>
        </form>
      </Section>

      {volunteer && (
        <Section id="privacy" title={t("set.privacy")} sub={t("set.privacySub")}>
          <div className="stack g16">
            <div className="stack g8" role="radiogroup" aria-label={t("set.privacy")}>
              {PRIVACY_MODES.map((p) => (
                <label key={p} className="radio-card" data-on={personal.privacy === p} style={{ position: "relative" }}>
                  <input type="radio" name="privacy" checked={personal.privacy === p} onChange={() => void savePersonal({ privacy: p, feedVisible: p === "private" ? false : personal.feedVisible })} />
                  <Icon name={privacyIcon[p]} />
                  <span className="stack g4">
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{t(`priv.${p}`)}</span>
                    <span className="t-small secondary">{t(`priv.${p}.b`)}</span>
                  </span>
                </label>
              ))}
            </div>
            <Checkbox checked={personal.feedVisible && personal.privacy !== "private"} onChange={(v) => void savePersonal({ feedVisible: v })}>{t("set.feed")}</Checkbox>
          </div>
        </Section>
      )}

      {volunteer && (
        <Section id="skills" title={t("sk.title")} sub={t("sk.sub")}>
          <SkillsSettings />
        </Section>
      )}

      <Section id="notifications" title={t("rem.title")} sub={t("rem.sub")}>
        <NotifySettings />
      </Section>

      {me.email && (
      <Section id="password" title={t("set.password")} sub={t("set.passwordSub")}>
        <div className="stack g20">
          <form className="stack g16" onSubmit={changePw} noValidate>
            <input type="text" autoComplete="username" value={me.username} readOnly hidden />
            <PasswordInput label={t("set.currentPw")} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={pwFields.current} />
            <div className="grid cols-2">
              <PasswordInput label={t("auth.newPassword")} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwFields.next} hint={t("auth.passwordHint")} />
              <PasswordInput label={t("set.confirmPw")} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwFields.confirm} />
            </div>
            <div><Button type="submit" variant="primary" loading={savingPw} disabled={!pw.current || !pw.next}>{t("set.changePw")}</Button></div>
          </form>
          <hr className="hr" />
          <div className="stack g8">
            <span style={{ fontWeight: 500, fontSize: 14 }}>{t("set.forgotTitle")}</span>
            <span className="t-small secondary">{t("set.forgotBody", { email: me.email })}</span>
            {resetSent !== null && <Notice tone="ok">{t("auth.resetSent")} {resetSent && <a className="link" href={`/reset-password?token=${resetSent}`}>{t("auth.devResetLink")}</a>}</Notice>}
            <div><Button icon="mail" onClick={async () => { const r = await api.requestPasswordReset(me.email); setResetSent(r.devResetToken ?? ""); }}>{t("set.sendReset")}</Button></div>
          </div>
        </div>
      </Section>
      )}

      <Section id="data" title={t("set.data")} sub={t("set.dataSub")}>
        <div className="row g12 wrap">
          <Button icon="download" onClick={async () => {
            const data = await api.exportMyData();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            a.download = `worfix-${me.username}.json`;
            a.click();
          }}>{t("set.export")}</Button>
          {me.role !== "admin" && me.role !== "super_admin" && <Button variant="danger" icon="trash" onClick={() => setDel(true)}>{t("set.delete")}</Button>}
        </div>
        {!FIREBASE && <p className="t-small muted" style={{ marginTop: 12 }}>{t("set.demoData")}</p>}
      </Section>

      {/* v5: on phones the sidebar (with its sign-out button) is hidden, so signing out lives here too */}
      <Section id="signout" title={t("a.logout")}>
        <Button icon="logout" onClick={async () => { await api.logout(); window.location.replace("/login"); }}>{t("a.logout")}</Button>
      </Section>

      <Dialog open={del} onClose={() => setDel(false)} title={t("set.deleteTitle")} footer={<>
        <Button variant="ghost" onClick={() => setDel(false)}>{t("a.cancel")}</Button>
        <Button variant="danger" disabled={delText !== me.username} onClick={async () => { try { await api.deleteAccount(); router.replace("/"); } catch (e) { toast(errText(e), "error"); } }}>{t("set.deleteConfirm")}</Button>
      </>}>
        <div className="stack g12">
          <p className="secondary">{t("set.deleteBody")}</p>
          <TextInput label={t("set.typeUsername", { u: me.username })} value={delText} onChange={(e) => setDelText(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
