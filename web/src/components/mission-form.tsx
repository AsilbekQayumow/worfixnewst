"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIFFICULTY_REWARD } from "@/lib/domain/rewards";
import { CATEGORIES, DIFFICULTIES, type Category, type Difficulty, type Mission } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { getPosition } from "@/lib/store/media";
import { CATEGORY_ICON, Icon } from "./icons";
import { PlaceSearch } from "./place-search";
import { TileMap } from "./tile-map";
import { Button, Coins, Field, Notice, TextArea, TextInput, useToast } from "./ui";

const local = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const inDays = (d: number, h: number) => { const x = new Date(Date.now() + d * 86_400_000); x.setHours(h, 0, 0, 0); return x.toISOString(); };

export function MissionForm({ existing }: { existing?: Mission }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [v, setV] = useState({
    title: existing?.title ?? "", description: existing?.description ?? "", category: (existing?.category ?? "environment") as Category,
    difficulty: (existing?.difficulty ?? "easy") as Difficulty, location: existing?.location ?? "",
    lat: existing?.coordinates?.lat ?? null as number | null, lng: existing?.coordinates?.lng ?? null as number | null,
    date: local(existing?.date ?? inDays(7, 9)), deadline: local(existing?.deadline ?? inDays(6, 18)), duration: String(existing?.duration ?? 120),
    capacity: String(existing?.capacity ?? 20), requirements: existing?.requirements ?? "", safety: existing?.safety ?? "", equipment: existing?.equipment ?? "",
    impactLabel: existing?.impactMetrics[0]?.label ?? "", impactAmount: String(existing?.impactMetrics[0]?.amountPerVolunteer ?? ""),
    radiusM: String(existing?.radiusM ?? 400), checklist: (existing?.checklist ?? []).join("\n"),
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const r = await api.saveMission({
        ...v, date: new Date(v.date).toISOString(), deadline: new Date(v.deadline).toISOString(), duration: Number(v.duration), capacity: Number(v.capacity),
        impactAmount: Number(v.impactAmount) || 0, radiusM: Number(v.radiusM), checklist: v.checklist.split("\n").map((s) => s.trim()).filter(Boolean),
      }, existing?.id);
      toast(existing ? t("mf.saved") : t("mf.created"));
      router.push(`/org/missions/${r.id}`);
    } catch (err) {
      if (err instanceof ValidationError) { setFields(err.fields); setError(t("v.check")); } else setError(errText(err));
    } finally { setBusy(false); }
  };

  const reward = DIFFICULTY_REWARD[v.difficulty];

  return (
    <form className="stack g24" onSubmit={submit} noValidate>
      {error && <Notice tone="bad">{error}</Notice>}
      <section className="card pad-lg stack g16">
        <h2 className="t-h3">{t("mf.basics")}</h2>
        <TextInput label={t("mf.title")} value={v.title} onChange={set("title")} error={fields.title} maxLength={100} />
        <TextArea label={t("mf.description")} hint={t("mf.descriptionHint")} value={v.description} onChange={set("description")} error={fields.description} rows={5} />
        <Field label={t("mf.category")}>
          <div className="row g8 wrap">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={v.category === c} onClick={() => setV((x) => ({ ...x, category: c }))}><Icon name={CATEGORY_ICON[c]} size={16} />{t(`cat.${c}`)}</button>
            ))}
          </div>
        </Field>
        <Field label={t("mf.difficulty")} hint={t("mf.difficultyHint")}>
          <div className="grid cols-3">
            {DIFFICULTIES.map((d) => (
              <label key={d} className="radio-card" data-on={v.difficulty === d} style={{ position: "relative", flexDirection: "column", gap: 6 }}>
                <input type="radio" name="difficulty" checked={v.difficulty === d} onChange={() => setV((x) => ({ ...x, difficulty: d }))} />
                <span style={{ fontWeight: 500 }}>{t(`diff.${d}`)}</span>
                <span className="t-small secondary">{t(`diff.${d}.b`)}</span>
                <span className="row g12 t-small num"><span>+{DIFFICULTY_REWARD[d].xp} XP</span><Coins value={`+${DIFFICULTY_REWARD[d].coins}`} size={14} /></span>
              </label>
            ))}
          </div>
        </Field>
        <p className="t-small muted">{t("mf.rewardNote", { xp: reward.xp, coins: reward.coins })}</p>
      </section>

      <section className="card pad-lg stack g16">
        <h2 className="t-h3">{t("mf.place")}</h2>
        <PlaceSearch near={v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : null}
          onPick={(h) => setV((x) => ({ ...x, lat: +h.lat.toFixed(6), lng: +h.lng.toFixed(6), location: x.location.trim() ? x.location : h.label.slice(0, 120) }))} />
        <TextInput label={t("mf.location")} value={v.location} onChange={set("location")} error={fields.location} placeholder={t("mf.locationPh")} />
        <div className="row between g8 wrap">
          <span className="t-small secondary">{v.lat !== null && v.lng !== null ? `${f.coords(v.lat, v.lng)} · ${t("mf.dragHint")}` : t("mf.pickHint")}</span>
          <Button size="sm" variant="ghost" icon="crosshair" loading={locating} onClick={async () => {
            setLocating(true);
            try { const p = await getPosition(); setV((x) => ({ ...x, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })); } catch (e) { toast(errText(e), "error"); } finally { setLocating(false); }
          }}>{t("mf.useMyLocation")}</Button>
        </div>
        <TileMap height={300} animateRoute={false} onPick={(p) => setV((x) => ({ ...x, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }))}
          markers={v.lat !== null && v.lng !== null ? [{ lat: v.lat, lng: v.lng, kind: "target" }] : [{ lat: 39.6542, lng: 66.9597, kind: "place" }]} label={t("mf.mapLabel")} />
        {fields.lat && <span className="error-text">{t(fields.lat)}</span>}
        <TextInput label={t("mf.radius")} inputMode="numeric" value={v.radiusM} onChange={set("radiusM")} error={fields.radiusM} hint={t("mf.radiusHint")} />
      </section>

      <section className="card pad-lg stack g16">
        <h2 className="t-h3">{t("mf.when")}</h2>
        <div className="grid cols-2">
          <TextInput label={t("mf.date")} type="datetime-local" value={v.date} onChange={set("date")} error={fields.date} />
          <TextInput label={t("mf.deadline")} type="datetime-local" value={v.deadline} onChange={set("deadline")} error={fields.deadline} />
          <TextInput label={t("mf.duration")} inputMode="numeric" value={v.duration} onChange={set("duration")} error={fields.duration} />
          <TextInput label={t("mf.capacity")} inputMode="numeric" value={v.capacity} onChange={set("capacity")} error={fields.capacity} />
        </div>
      </section>

      <section className="card pad-lg stack g16">
        <h2 className="t-h3">{t("mf.verification")}</h2>
        <TextArea label={t("mf.checklist")} hint={t("mf.checklistHint")} value={v.checklist} onChange={set("checklist")} rows={4} />
        <div className="grid cols-2">
          <TextInput label={t("mf.impactLabel")} placeholder={t("mf.impactPh")} value={v.impactLabel} onChange={set("impactLabel")} />
          <TextInput label={t("mf.impactAmount")} inputMode="decimal" value={v.impactAmount} onChange={set("impactAmount")} error={fields.impactAmount} />
        </div>
      </section>

      <section className="card pad-lg stack g16">
        <h2 className="t-h3">{t("mf.safetyBlock")}</h2>
        <TextArea label={t("md.safety")} value={v.safety} onChange={set("safety")} error={fields.safety} rows={3} />
        <TextArea label={t("md.requirements")} value={v.requirements} onChange={set("requirements")} rows={2} />
        <TextArea label={t("md.equipment")} value={v.equipment} onChange={set("equipment")} rows={2} />
      </section>

      <div className="row g12">
        <Button type="submit" variant="primary" size="lg" loading={busy}>{existing ? t("a.save") : t("mf.createDraft")}</Button>
        <Button variant="ghost" onClick={() => router.back()}>{t("a.cancel")}</Button>
      </div>
    </form>
  );
}

