"use client";
/** v6: small shared pieces for the 2026-11 features (report, rating, follow, challenge card, emergency banner, skills). */
import Link from "next/link";
import { useState } from "react";
import { REPORT_REASONS, type ReportReason, type ReportTarget } from "@/lib/domain/reports";
import { ORG_TAGS, VOL_TAGS, type RatingKind } from "@/lib/domain/ratings";
import { skillName } from "@/lib/domain/skills";
import { EMERGENCY_NUMBERS } from "@/lib/domain/emergency";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { Button, Dialog, Progress, TextArea, cx, useToast } from "./ui";

/* ── 8 · report ── */
export function ReportButton({ type, id, label, small, className }: { type: ReportTarget; id: string; label?: boolean; small?: boolean; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size={small ? "sm" : "md"} icon="flag" iconOnly={!label} aria-label={t("rpt.title")} title={t("rpt.title")} className={className} onClick={() => setOpen(true)}>
        {label ? t("rpt.title") : null}
      </Button>
      <ReportDialog open={open} onClose={() => setOpen(false)} type={type} id={id} />
    </>
  );
}

export function ReportDialog({ open, onClose, type, id }: { open: boolean; onClose: () => void; type: ReportTarget; id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reasons = REPORT_REASONS.filter((r) => r !== "fake_mission" || type === "mission" || type === "organization");
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try { await api6.report(type, id, reason, note); toast(t("rpt.thanks")); setReason(null); setNote(""); onClose(); }
    catch (e) { toast(errText(e), "error"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("rpt.title")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" disabled={!reason} loading={busy} onClick={send}>{t("rpt.send")}</Button>
    </>}>
      <div className="stack g12">
        <p className="t-small secondary">{t("rpt.body")}</p>
        <div className="stack g8" role="radiogroup" aria-label={t("rpt.reason")}>
          {reasons.map((r) => (
            <label key={r} className={cx("choice", reason === r && "is-on")}>
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
              <span className="stack"><strong>{t(`rpt.r.${r}`)}</strong><span className="t-small muted">{t(`rpt.rh.${r}`)}</span></span>
            </label>
          ))}
        </div>
        <TextArea label={t("rpt.note")} value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} />
        <p className="t-small muted row g8"><Icon name="lock" size={14} />{t("rpt.private")}</p>
      </div>
    </Dialog>
  );
}

/* ── 7 · ratings ── */
export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const { t } = useI18n();
  return (
    <div className="stars" role={onChange ? "radiogroup" : "img"} aria-label={t("rat.stars", { n: value })}>
      {[1, 2, 3, 4, 5].map((n) => onChange ? (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t("rat.stars", { n })} className={cx("star", n <= value && "is-on")} style={{ fontSize: size }} onClick={() => onChange(n)}>★</button>
      ) : <span key={n} className={cx("star", n <= Math.round(value) && "is-on")} style={{ fontSize: size }} aria-hidden>★</span>)}
    </div>
  );
}

export function RateDialog({ open, onClose, kind, missionId, toId, name }: { open: boolean; onClose: () => void; kind: RatingKind; missionId: string; toId: string; name: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const options: readonly string[] = kind === "vol_to_org" ? ORG_TAGS : VOL_TAGS;
  const send = async () => {
    setBusy(true);
    try { await api6.rate(kind, missionId, toId, { stars, tags, comment }); toast(t("rat.thanks")); onClose(); }
    catch (e) { toast(errText(e), "error"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t(kind === "vol_to_org" ? "rat.titleOrg" : "rat.titleVol", { name })} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("rat.later")}</Button>
      <Button variant="primary" disabled={!stars} loading={busy} onClick={send}>{t("rat.send")}</Button>
    </>}>
      <div className="stack g16">
        <Stars value={stars} onChange={setStars} size={34} />
        <div className="stack g8">
          <span className="t-small secondary">{t("rat.tagsHint")}</span>
          <div className="row g8 wrap">
            {options.map((x) => {
              const on = tags.includes(x);
              return <button key={x} type="button" className={cx("chip", on && "is-on")} aria-pressed={on}
                onClick={() => setTags((v) => (on ? v.filter((y) => y !== x) : v.length >= 3 ? v : [...v, x]))}>{t(`rat.tag.${x}`)}</button>;
            })}
          </div>
        </div>
        <TextArea label={t("rat.comment")} value={comment} maxLength={300} rows={3} onChange={(e) => setComment(e.target.value)} />
        <p className="t-small muted row g8"><Icon name="eyeOff" size={14} />{t("rat.blind")}</p>
      </div>
    </Dialog>
  );
}

/** Home: "rate the mission" prompts (feature 7). */
export function RatingsToGive() {
  const { t } = useI18n();
  const q = useApi(() => api6.ratingsToGive(), []);
  const [open, setOpen] = useState<{ missionId: string; orgId: string; orgName: string } | null>(null);
  if (!q.data?.length) return null;
  const first = q.data[0];
  return (
    <section className="card pad row g12 wrap v6-prompt">
      <span className="v6-ico"><Icon name="award" size={20} /></span>
      <span className="stack grow" style={{ minWidth: 180 }}>
        <strong>{t("rat.prompt", { org: first.orgName })}</strong>
        <span className="t-small muted">{first.title}{q.data.length > 1 ? ` · +${q.data.length - 1}` : ""}</span>
      </span>
      <Button variant="primary" size="sm" onClick={() => setOpen(first)}>{t("rat.rateNow")}</Button>
      {open && <RateDialog open onClose={() => { setOpen(null); q.reload(); }} kind="vol_to_org" missionId={open.missionId} toId={open.orgId} name={open.orgName} />}
    </section>
  );
}

export function OrgRatingLine({ score, count, isNew }: { score: number; count: number; isNew: boolean }) {
  const { t } = useI18n();
  return (
    <span className="row g8 t-small">
      <Stars value={score} size={16} />
      <strong className="num">{score.toFixed(1)}</strong>
      <span className="muted">{isNew ? t("rat.new") : t("rat.count", { n: count })}</span>
    </span>
  );
}

/* ── 12 · follow ── */
export function FollowButton({ orgId, following, onChange, small }: { orgId: string; following: boolean; onChange?: () => void; small?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  return (
    <Button size={small ? "sm" : "md"} variant={following ? "secondary" : "primary"} icon={following ? "check" : "plus"} loading={busy}
      onClick={async () => {
        setBusy(true);
        try { await api6.follow(orgId, !following); toast(t(following ? "fo.off" : "fo.on")); onChange?.(); } catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
      }}>
      {following ? t("fo.following") : t("fo.follow")}
    </Button>
  );
}

/* ── 1 · challenge card ── */
export function ChallengeCard() {
  const { t, lang } = useI18n();
  const q = useApi(() => api6.challenges(), []);
  const c = q.data?.live[0];
  if (!c) return null;
  const goal = c.goal.per === "community" ? c.goal.target : c.tiers[2].at;
  const value = c.goal.per === "community" ? c.community : c.mine?.value ?? 0;
  const next = c.tiers.find((x) => (c.mine?.value ?? 0) < x.at);
  return (
    <section className="card pad stack g12 challenge-card" aria-label={t("ch.current")}>
      <div className="row between g8 wrap">
        <span className="row g8"><span className="v6-ico"><Icon name="trophy" size={18} /></span><span className="t-meta">{t("ch.current")}</span></span>
        <span className="t-small muted">{t("ch.daysLeft", { n: c.daysLeft })}</span>
      </div>
      <h2 className="t-h3">{c.title[lang] || c.title.uz || c.title.en}</h2>
      <Progress value={Math.min(1, value / Math.max(1, goal))} label={`${value} / ${goal} · ${t(`ch.metric.${c.goal.metric}`)}`} />
      <div className="row g8 wrap t-small">
        {c.tiers.map((tier, i) => (
          <span key={i} className={cx("chip", (c.mine?.tierReached ?? 0) > i && "is-on")}>{t("ch.tier", { n: i + 1 })} · {tier.at}</span>
        ))}
      </div>
      <span className="t-small secondary">
        {next ? t("ch.next", { left: Math.max(0, next.at - (c.mine?.value ?? 0)), xp: next.rewardXP, coins: next.rewardPoints }) : t("ch.allDone")}
        {c.sponsor ? ` · ${t("ch.sponsor", { name: c.sponsor })}` : ""}
      </span>
      <Link href={`/app/map?view=list&tab=explore&category=${c.theme}`} className="link t-small">{t("ch.find", { theme: t(`cat.${c.theme}`) })}</Link>
    </section>
  );
}

/* ── 19 · emergency ── */
export function EmergencyNumbers() {
  const { t } = useI18n();
  return (
    <div className="em-numbers" role="note">
      <strong className="row g8"><Icon name="phone" size={16} />{t("em.callFirst")}</strong>
      <div className="row g8 wrap">
        {EMERGENCY_NUMBERS.map((x) => <a key={x.n} className="chip" href={`tel:${x.n}`}><strong className="num">{x.n}</strong> {t(x.key)}</a>)}
      </div>
    </div>
  );
}

export function EmergencyBanner({ base = "/app" }: { base?: "/app" | "/org" | "/admin" }) {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api6.emergencies(), []);
  if (!q.data) return null;
  return (
    <>
      {q.data.verified.map((e) => (
        <Link key={e.id} href={`${base}/emergency/${e.id}`} className="em-banner" data-level="3">
          <Icon name="alert" size={22} />
          <span className="stack grow">
            <strong>{t("em.verified")} · {e.title}</strong>
            <span className="t-small">{e.place} · {t("em.going", { n: e.goingCount })} · {f.relative(e.createdAt)}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </Link>
      ))}
      {q.data.unverified.map((e, i) => (
        <div key={i} className="em-banner" data-level="2" role="status">
          <Icon name="alert" size={22} />
          <span className="stack grow">
            <strong>{t("em.unverified")} · {t(`em.k.${e.kind}`)}</strong>
            <span className="t-small">{t("em.unverifiedBody", { n: e.people })}</span>
          </span>
        </div>
      ))}
    </>
  );
}

/* ── 11 · skills ── */
export function SkillChips({ ids, verified }: { ids: string[]; verified?: string[] }) {
  const { t, lang } = useI18n();
  if (!ids.length) return null;
  return (
    <span className="row g8 wrap">
      {ids.map((id) => (
        <span key={id} className={cx("chip", verified?.includes(id) && "is-on")} title={verified?.includes(id) ? t("sk.verified") : undefined}>
          {verified?.includes(id) && <Icon name="checkCircle" size={14} />}{skillName(id, lang)}
        </span>
      ))}
    </span>
  );
}
