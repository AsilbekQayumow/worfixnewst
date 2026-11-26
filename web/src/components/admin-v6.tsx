"use client";
/** v6: admin tools — reports queue (8), fair play (10), challenges (1), emergencies (19). */
import Link from "next/link";
import { useState } from "react";
import { REPORT_ACTIONS, type ReportAction } from "@/lib/domain/reports";
import { EMERGENCY_KINDS, type EmergencyKind } from "@/lib/domain/emergency";
import { SKILLS, skillName } from "@/lib/domain/skills";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import type { ChallengeMetric } from "@/lib/domain/challenges";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";
import { getPosition } from "@/lib/store/media";
import { Icon } from "./icons";
import { Button, Checkbox, Dialog, Empty, Notice, Select, Skeleton, Status, TextArea, TextInput, useToast } from "./ui";

function useRun() {
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(errText(e), "error"); return false; } finally { setBusy(null); }
  };
  return { busy, run };
}

/* ── 8 ── */
export function AdminReports() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api6.adminReports(), []);
  const { busy, run } = useRun();
  const [note, setNote] = useState<Record<string, string>>({});
  if (!q.data) return <Skeleton rows={3} />;
  if (!q.data.length) return <div className="card"><Empty icon="shield" title={t("rpt.ad.empty")} /></div>;
  return (
    <div className="stack g12">
      {q.data.map((r) => (
        <article key={r.key} className="card pad stack g12">
          <div className="row between g8 wrap">
            <span className="row g8 wrap">
              {r.minor && <Status tone="bad">{t("rpt.ad.minor")}</Status>}
              {r.urgent && <Status tone="warn">{t("rpt.ad.urgent")}</Status>}
              <Status tone="neutral">{t(`rpt.t.${r.targetType}`)}</Status>
              {r.reasons.map((x) => <Status key={x} tone={x === "unsafe" || x === "harassment" ? "bad" : "info"}>{t(`rpt.r.${x}`)}</Status>)}
            </span>
            <span className="t-meta">{t("rpt.ad.reporters", { n: r.reporters })} · {f.relative(r.firstAt)}</span>
          </div>
          <strong>{r.link ? <Link className="link" href={r.link}>{r.label}</Link> : r.label}</strong>
          {r.snapshot && <blockquote className="inset t-small" style={{ padding: 12, whiteSpace: "pre-wrap" }}>{r.snapshot}</blockquote>}
          {r.notes.length > 0 && <ul className="t-small secondary stack g4">{r.notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>}
          {r.owner && <span className="t-small muted">{t("rpt.ad.owner")}: {r.owner.name}{r.owner.status !== "active" ? ` (${r.owner.status})` : ""}</span>}
          <TextInput aria-label={t("rpt.ad.note")} placeholder={t("rpt.ad.note")} value={note[r.key] ?? ""} onChange={(e) => setNote((x) => ({ ...x, [r.key]: e.target.value }))} />
          <div className="row g8 wrap">
            {REPORT_ACTIONS.filter((a) => a !== "suspend" || r.owner).filter((a) => a !== "hide" || ["message", "post", "mission", "signal"].includes(r.targetType)).map((a: ReportAction) => (
              <Button key={a} size="sm" variant={a === "dismiss" ? "ghost" : a === "suspend" ? "danger" : "secondary"} loading={busy === `${r.key}${a}`}
                onClick={() => run(`${r.key}${a}`, () => api6.decideReport(r.targetType, r.targetId, a, note[r.key] ?? ""), t("rpt.ad.done"))}>{t(`rpt.a.${a}`)}</Button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

/* ── 10 ── */
export function AdminFairplay() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api6.adminFairplay(), []);
  const { busy, run } = useRun();
  if (!q.data) return <Skeleton rows={3} />;
  return (
    <div className="stack g12">
      {q.data.shadow && <Notice tone="info">{t("fp.shadow")}</Notice>}
      {q.data.items.length === 0 ? <div className="card"><Empty icon="footprints" title={t("fp.empty")} /></div> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("fp.who")}</th><th>{t("fp.score")}</th><th>{t("fp.signals")}</th><th>{t("fp.when")}</th><th /></tr></thead>
            <tbody>
              {q.data.items.map((x) => (
                <tr key={x.capture.id}>
                  <td><Link className="link" href={`/app/people/${x.userId}`}>{x.name}</Link>{x.needsReview && <> <Status tone="bad">{t("fp.strikes", { n: x.strikes })}</Status></>}</td>
                  <td className="num">{x.capture.fairplay!.score.toFixed(2)} <span className="t-meta">{t(`fp.v.${x.capture.fairplay!.verdict}`)}</span></td>
                  <td className="t-small">
                    {x.capture.fairplay!.flags.map((fl) => t(`fp.f.${fl}`)).join(", ") || "—"}
                    <span className="t-meta"> · p95 {x.capture.fairplay!.p95Speed} km/h{x.capture.fairplay!.stepsPerKm != null ? ` · ${x.capture.fairplay!.stepsPerKm}/km` : ""} · {x.capture.fairplay!.source}</span>
                  </td>
                  <td className="t-small">{f.relative(x.capture.createdAt)}</td>
                  <td>{x.needsReview && <Button size="sm" variant="danger" loading={busy === x.capture.id} onClick={() => confirm(t("fp.voidConfirm")) && run(x.capture.id, () => api6.voidWalks(x.userId), t("fp.voided"))}>{t("fp.void")}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 1 ── */
export function AdminChallenges() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const q = useApi(() => api6.adminChallenges(), []);
  const { busy, run } = useRun();
  const [edit, setEdit] = useState(false);
  if (!q.data) return <Skeleton rows={3} />;
  return (
    <div className="stack g12">
      <div className="row between"><p className="t-small secondary">{t("ch.ad.sub")}</p><Button variant="primary" icon="plus" onClick={() => setEdit(true)}>{t("ch.ad.new")}</Button></div>
      {q.data.length === 0 ? <div className="card"><Empty icon="trophy" title={t("ch.ad.empty")} /></div> : q.data.map((c) => (
        <article key={c.id} className="card pad row g12 wrap">
          <span className="stack grow" style={{ minWidth: 200 }}>
            <strong>{c.title[lang] || c.title.uz}</strong>
            <span className="t-small muted">{t(`cat.${c.theme}`)} · {f.date(c.startsAt)} – {f.date(c.endsAt)} · {t(`ch.metric.${c.goal.metric}`)} · {t("ch.ad.people", { n: c.people })}</span>
          </span>
          <Status tone={c.status === "live" ? "ok" : c.status === "draft" ? "neutral" : "info"}>{t(`ch.s.${c.status}`)}</Status>
          {c.status === "draft" && <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => run(c.id, () => api6.setChallengeStatus(c.id, "live"), t("ch.ad.live"))}>{t("ch.ad.publish")}</Button>}
          {c.status === "live" && <Button size="sm" loading={busy === c.id} onClick={() => run(c.id, () => api6.setChallengeStatus(c.id, "ended"))}>{t("ch.ad.end")}</Button>}
        </article>
      ))}
      {edit && <ChallengeForm onClose={() => setEdit(false)} />}
    </div>
  );
}

function ChallengeForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { busy, run } = useRun();
  const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  const [v, setV] = useState({ uz: "", ru: "", en: "", theme: "environment" as Category, start: day(0), end: day(30), metric: "missions" as ChallengeMetric, target: 5, per: "person" as "person" | "community",
    tiers: [{ at: 1, rewardXP: 30, rewardPoints: 10 }, { at: 3, rewardXP: 80, rewardPoints: 30 }, { at: 5, rewardXP: 150, rewardPoints: 60 }] });
  const set = (k: string, x: unknown) => setV((s) => ({ ...s, [k]: x }));
  return (
    <Dialog open wide onClose={onClose} title={t("ch.ad.new")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy === "save"} onClick={async () => {
        const ok = await run("save", () => api6.saveChallenge({
          title: { uz: v.uz, ru: v.ru, en: v.en }, theme: v.theme, startsAt: `${v.start}T00:00:00+05:00`, endsAt: `${v.end}T23:59:59+05:00`, metric: v.metric, target: v.target, per: v.per,
          tiers: v.tiers.map((x, i) => ({ ...x, badgeId: `tier${i + 1}` })),
        }), t("ch.ad.saved"));
        if (ok) onClose();
      }}>{t("a.save")}</Button>
    </>}>
      <div className="stack g12">
        <div className="grid cols-3">
          <TextInput label={t("ch.ad.titleUz")} value={v.uz} onChange={(e) => set("uz", e.target.value)} />
          <TextInput label={t("ch.ad.titleRu")} value={v.ru} onChange={(e) => set("ru", e.target.value)} />
          <TextInput label={t("ch.ad.titleEn")} value={v.en} onChange={(e) => set("en", e.target.value)} />
        </div>
        <div className="grid cols-3">
          <Select label={t("ch.ad.theme")} value={v.theme} onChange={(e) => set("theme", e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</Select>
          <TextInput type="date" label={t("ch.ad.start")} value={v.start} onChange={(e) => set("start", e.target.value)} />
          <TextInput type="date" label={t("ch.ad.end2")} value={v.end} onChange={(e) => set("end", e.target.value)} />
        </div>
        <div className="grid cols-3">
          <Select label={t("ch.ad.metric")} value={v.metric} onChange={(e) => set("metric", e.target.value)}>{(["missions", "hours", "impact"] as const).map((m) => <option key={m} value={m}>{t(`ch.metric.${m}`)}</option>)}</Select>
          <TextInput type="number" min={1} label={t("ch.ad.target")} value={v.target} onChange={(e) => set("target", Number(e.target.value))} />
          <Select label={t("ch.ad.per")} value={v.per} onChange={(e) => set("per", e.target.value)}><option value="person">{t("ch.per.person")}</option><option value="community">{t("ch.per.community")}</option></Select>
        </div>
        {v.tiers.map((tier, i) => (
          <div key={i} className="grid cols-3">
            <TextInput type="number" min={1} label={t("ch.ad.tierAt", { n: i + 1 })} value={tier.at} onChange={(e) => set("tiers", v.tiers.map((x, j) => (j === i ? { ...x, at: Number(e.target.value) } : x)))} />
            <TextInput type="number" min={0} label="XP" value={tier.rewardXP} onChange={(e) => set("tiers", v.tiers.map((x, j) => (j === i ? { ...x, rewardXP: Number(e.target.value) } : x)))} />
            <TextInput type="number" min={0} max={150} label="Fixcoin" value={tier.rewardPoints} onChange={(e) => set("tiers", v.tiers.map((x, j) => (j === i ? { ...x, rewardPoints: Number(e.target.value) } : x)))} />
          </div>
        ))}
        <p className="t-small muted">{t("ch.ad.cap")}</p>
      </div>
    </Dialog>
  );
}

/* ── 19 ── */
export function AdminEmergency() {
  const { t } = useI18n();
  const q = useApi(() => api6.emergencies(), []);
  const orgs = useApi(() => api.adminOrganizations(), []);
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <div className="stack g16">
      <div className="row between g8 wrap"><p className="t-small secondary">{t("em.ad.sub")}</p><Button variant="danger" icon="alert" onClick={() => setOpen(true)}>{t("em.declare")}</Button></div>
      {q.data?.verified.map((e) => <Link key={e.id} href={`/admin/emergency/${e.id}`} className="em-banner" data-level="3"><Icon name="alert" size={20} /><span className="grow">{e.title} · {t("em.going", { n: e.goingCount })}</span><Icon name="chevronRight" size={18} /></Link>)}
      {q.data?.unverified.map((e, i) => <div key={i} className="em-banner" data-level="2"><Icon name="alert" size={20} /><span>{t(`em.k.${e.kind}`)} · {t("em.unverifiedBody", { n: e.people })}</span></div>)}
      <section className="card pad stack g8">
        <h3 className="t-h3">{t("em.ad.partners")}</h3>
        <p className="t-small muted">{t("em.ad.partnersHint")}</p>
        {(orgs.data ?? []).filter((o) => o.verificationStatus === "approved").map((o) => (
          <div key={o.id} className="row between g8">
            <span>{o.name}</span>
            <Checkbox checked={Boolean(o.emergencyPartner)} onChange={(v) => run(o.id, () => api6.setEmergencyPartner(o.id, v))}>{busy === o.id ? "…" : t("em.ad.partner")}</Checkbox>
          </div>
        ))}
      </section>
      {open && <DeclareEmergency onClose={() => setOpen(false)} />}
    </div>
  );
}

export function DeclareEmergency({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const { busy, run } = useRun();
  const [v, setV] = useState({ type: "flood" as EmergencyKind, title: "", note: "", place: "", provinces: "", cities: "", needs: [] as string[], points: "", contacts: "", hours: 24 });
  const set = (k: string, x: unknown) => setV((s) => ({ ...s, [k]: x }));
  const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return (
    <Dialog open wide onClose={onClose} title={t("em.declare")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="danger" loading={busy === "go"} onClick={async () => {
        const pos = await getPosition(8000).catch(() => null);
        const ok = await run("go", () => api6.declareEmergency({
          type: v.type, title: v.title, note: v.note, place: v.place, lat: pos?.lat ?? 41.3111, lng: pos?.lng ?? 69.2797, provinces: list(v.provinces), cities: list(v.cities),
          needs: v.needs, meetingPoints: list(v.points), contacts: v.contacts, hours: v.hours,
        }), t("em.declared"));
        if (ok) onClose();
      }}>{t("em.declareGo")}</Button>
    </>}>
      <div className="stack g12">
        <Notice tone="warn">{t("em.declareWarn")}</Notice>
        <div className="grid cols-2">
          <Select label={t("em.kind")} value={v.type} onChange={(e) => set("type", e.target.value)}>{EMERGENCY_KINDS.map((k) => <option key={k} value={k}>{t(`em.k.${k}`)}</option>)}</Select>
          <TextInput type="number" min={1} max={168} label={t("em.hours")} value={v.hours} onChange={(e) => set("hours", Number(e.target.value))} />
        </div>
        <TextInput label={t("em.titleLabel")} value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
        <TextArea label={t("em.noteLabel")} value={v.note} rows={3} maxLength={1000} onChange={(e) => set("note", e.target.value)} />
        <TextInput label={t("em.placeLabel")} value={v.place} onChange={(e) => set("place", e.target.value)} />
        <div className="grid cols-2">
          <TextInput label={t("em.provinces")} hint={t("em.listHint")} value={v.provinces} onChange={(e) => set("provinces", e.target.value)} />
          <TextInput label={t("em.cities")} hint={t("em.listHint")} value={v.cities} onChange={(e) => set("cities", e.target.value)} />
        </div>
        <div className="stack g8">
          <span className="t-small secondary">{t("em.needs")}</span>
          <div className="row g8 wrap">
            {SKILLS.filter((s) => ["medical", "driving", "building", "support", "organizing"].includes(s.group)).map((s) => {
              const on = v.needs.includes(s.id);
              return <button key={s.id} type="button" className="chip" aria-pressed={on} onClick={() => set("needs", on ? v.needs.filter((x) => x !== s.id) : [...v.needs, s.id])}>{skillName(s.id, lang)}</button>;
            })}
          </div>
        </div>
        <TextArea label={t("em.points")} hint={t("em.listHint")} value={v.points} rows={2} onChange={(e) => set("points", e.target.value)} />
        <TextInput label={t("em.contacts")} value={v.contacts} onChange={(e) => set("contacts", e.target.value)} />
      </div>
    </Dialog>
  );
}
