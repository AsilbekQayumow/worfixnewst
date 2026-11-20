"use client";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import { detectLocation, loadGeo, type GeoCountry } from "@/lib/geo";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError, type SelfUser } from "@/lib/store/api";
import { avatarFromFile } from "@/lib/store/media";
import { CATEGORY_ICON, Icon } from "./icons";
import { Avatar, Button, Field, Notice, Select, TextArea, TextInput, useToast } from "./ui";

/** Comma-separated tags input. */
function TagsInput({ label, value, onChange, placeholder, error }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; error?: string }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => { setText(value.join(", ")); }, [value]);
  return (
    <TextInput label={label} value={text} placeholder={placeholder} error={error}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(",").map((s) => s.trim()).filter(Boolean))} />
  );
}

export function ProfileForm({ me, onboarding, onSaved }: { me: SelfUser; onboarding?: boolean; onSaved?: () => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: me.fullName, username: me.username.startsWith("user_") && onboarding ? "" : me.username, bio: me.bio, country: me.country || "Uzbekistan",
    province: me.province, city: me.city, feedVisible: me.feedVisible, languages: me.languages.length ? me.languages : ["O'zbek"], skills: me.skills,
    interests: me.interests as Category[],
  });
  const [avatar, setAvatar] = useState<string | null>(me.avatar);
  const [geo, setGeo] = useState<GeoCountry[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadGeo().then(setGeo); }, []);
  const provinces = geo.find((g) => g.n === form.country)?.s ?? [];
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      await api.updateProfile(form, { avatar, onboarded: onboarding });
      toast(t("pf.saved"));
      onSaved?.();
    } catch (err) {
      if (err instanceof ValidationError) { setFields(err.fields); setError(t("v.check")); } else setError(errText(err));
    } finally { setBusy(false); }
  };

  return (
    <form className="stack g20" onSubmit={save} noValidate>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="row g16">
        <Avatar name={form.fullName || "?"} src={avatar} size={72} />
        <div className="stack g8">
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { setAvatar(await avatarFromFile(f)); } catch (err) { toast(errText(err), "error"); }
          }} />
          <div className="row g8">
            <Button size="sm" icon="upload" onClick={() => file.current?.click()}>{t("pf.photo")}</Button>
            {avatar && <Button size="sm" variant="ghost" onClick={() => setAvatar(null)}>{t("pf.removePhoto")}</Button>}
          </div>
          <span className="t-small muted">{t("pf.photoHint")}</span>
        </div>
      </div>

      <div className="grid cols-2">
        <TextInput label={t("auth.fullName")} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} error={fields.fullName} autoComplete="name" />
        <TextInput label={t("pf.username")} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={fields.username} hint={t("pf.usernameHint")} autoComplete="username" spellCheck={false} />
      </div>
      <TextArea label={t("pf.bio")} value={form.bio} onChange={(e) => set("bio", e.target.value)} error={fields.bio} maxLength={280} rows={2} hint={`${form.bio.length} / 280`} />

      <div className="stack g12">
        <div className="row between wrap g8">
          <span className="label">{t("pf.location")}</span>
          <Button size="sm" variant="ghost" icon="crosshair" loading={locating} onClick={async () => {
            setLocating(true);
            try { const d = await detectLocation(); setForm((f) => ({ ...f, ...d })); } catch (err) { toast(errText(err), "error"); } finally { setLocating(false); }
          }}>{t("pf.detect")}</Button>
        </div>
        <div className="grid cols-3">
          <Select label={t("org.country")} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, province: "" }))} error={fields.country}>
            {!geo.length && <option>{form.country}</option>}
            {geo.map((g) => <option key={g.c} value={g.n}>{g.n}</option>)}
          </Select>
          <Select label={t("pf.province")} value={form.province} onChange={(e) => set("province", e.target.value)} disabled={!provinces.length}>
            <option value="">—</option>
            {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <TextInput label={t("org.city")} value={form.city} onChange={(e) => set("city", e.target.value)} error={fields.city} />
        </div>
      </div>

      <Field label={t("pf.interests")} hint={t("pf.interestsHint")} error={fields.interests}>
        <div className="row g8 wrap">
          {CATEGORIES.map((c) => {
            const on = form.interests.includes(c);
            return (
              <button key={c} type="button" className="chip" aria-pressed={on} onClick={() => set("interests", on ? form.interests.filter((x) => x !== c) : [...form.interests, c])}>
                <Icon name={CATEGORY_ICON[c]} size={16} />{t(`cat.${c}`)}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid cols-2">
        <TagsInput label={t("pf.skills")} value={form.skills} onChange={(v) => set("skills", v)} placeholder={t("pf.skillsPh")} />
        <TagsInput label={t("pf.languages")} value={form.languages} onChange={(v) => set("languages", v)} error={fields.languages} />
      </div>

      <div className="row g12">
        <Button type="submit" variant="primary" loading={busy}>{onboarding ? t("pf.finish") : t("a.save")}</Button>
      </div>
    </form>
  );
}
