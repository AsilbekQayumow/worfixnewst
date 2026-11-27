"use client";
import { MyFollows } from "@/components/follow-row";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AchievementGrid, Medal } from "@/components/achievements";
import { BadgeShelf, ImpactCounter, LookAvatar, LookTitle } from "@/components/game";
import { tierRarity } from "@/lib/game/badges";
import { api7 } from "@/lib/store/api7";
import { MyTree } from "@/components/my-tree";
import { personColor } from "@/lib/map-colors";
import { ShareCard } from "@/components/results";
import type { AchievementState } from "@/lib/domain/achievements";
import { CertificateCanvas } from "@/components/certificate";
import { Icon } from "@/components/icons";
import { useMe } from "@/components/providers";
import { PageHead } from "@/components/shell";
import { Avatar, Button, ButtonLink, CategoryTag, Coins, Dialog, Empty, Progress, Skeleton, Stat, Tabs } from "@/components/ui";
import { CERTIFICATE_LEVELS, levelProgress, levelTitleKey, xpForLevel } from "@/lib/domain/rewards";
import type { Certificate } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { RankLadder } from "@/components/rank";
import { MyReport } from "@/components/report";

type Tab = "overview" | "report" | "achievements" | "certificates";

const TIER_RANK = { gold: 3, silver: 2, bronze: 1 } as const;
/** The best unlocked medal of each family, gold first: up to eight. */
function showcase(list: AchievementState[]) {
  const best = new Map<string, AchievementState>();
  for (const a of list) {
    if (!a.unlocked) continue;
    const key = a.family + (a.cause ?? "");
    const cur = best.get(key);
    if (!cur || TIER_RANK[a.tier] > TIER_RANK[cur.tier]) best.set(key, a);
  }
  return [...best.values()].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]).slice(0, 8);
}

function Profile() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const { me } = useMe();
  const initial = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(initial === "achievements" || initial === "certificates" || initial === "report" ? initial : "overview");
  const ins = useApi(() => api.myInsights());
  const certs = useApi(() => api.myCertificates());
  const game = useApi(() => api7.game(null));
  const [open, setOpen] = useState<Certificate | null>(null);
  if (!me) return null;
  const lp = levelProgress(me.xp);

  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.profile")} actions={<>{me.role === "volunteer" && <ShareCard />}<ButtonLink href="/app/diary" icon="book">{t("di.title")}</ButtonLink><ButtonLink href="/app/settings" icon="edit">{t("pf.edit")}</ButtonLink></>} />
      {me.role === "volunteer" && <MyFollows />}
      <section className="row g20 wrap profile5-head" style={{ ["--tint" as string]: personColor(me.id, me.mapColor) }}>
        <span className="profile5-avatar"><LookAvatar name={me.fullName} src={me.avatar} size={96} frame={me.look?.frame} /></span>
        <div className="stack g8 grow" style={{ minWidth: 220 }}>
          <h2 className="t-h1">{me.fullName}</h2>
          {me.look?.title && <LookTitle id={me.look.title} />}
          {me.mahalla && <span className="t-small secondary row g4"><Icon name="pin" size={14} />{[me.mahalla, me.district].filter(Boolean).join(", ")}</span>}
          <span className="secondary">@{me.username} · {t("lvl.long", { n: lp.level })} · {t(levelTitleKey(lp.level))}{me.city ? ` · ${me.city}` : ""}</span>
          {me.bio && <p className="secondary" style={{ maxWidth: 560 }}>{me.bio}</p>}
          <div className="row g12 wrap">{me.interests.map((c) => <CategoryTag key={c} category={c} />)}</div>
        </div>
        <span className="row g8 t-small secondary"><Icon name={me.privacy === "private" ? "lock" : me.privacy === "friends" ? "users" : "globe"} size={16} />{t(`priv.${me.privacy ?? "public"}`)}</span>
      </section>

      <Tabs value={tab} onChange={setTab} items={[
        { value: "overview", label: t("pf.overview") },
        ...(me.role === "volunteer" ? [{ value: "report" as Tab, label: t("h5.report") }] : []),
        { value: "achievements", label: t("pf.achievements"), count: ins.data?.unlocked },
        { value: "certificates", label: t("pf.certificates"), count: certs.data?.length },
      ]} />

      {tab === "overview" && (
        <div className="stack g16">
          <div className="grid cols-4">
            <Stat label="XP" value={f.num(me.xp)} sub={t("home.app.xpToNext", { n: f.num(lp.next - me.xp), level: lp.level + 1 })} />
            <Stat label={t("coin.balance")} value={<Coins value={f.num(me.points)} size={22} />} />
            <Stat label={t("home.app.hours")} value={Math.round(me.totalVolunteerHours * 10) / 10} />
            <Stat label={t("home.app.done")} value={ins.data?.approved ?? "—"} />
          </div>
          <MyTree count={ins.data?.approved ?? 0} last={me.lastApprovedDay} />
          <section className="card pad stack g16">
            <div className="row between g12">
              <h3 className="t-h3">{t("pf.showcase")}</h3>
              <Button size="sm" variant="ghost" onClick={() => setTab("achievements")}>{t("pf.showcaseAll")}</Button>
            </div>
            {!ins.data ? <Skeleton rows={1} height={72} /> : showcase(ins.data.achievements).length === 0
              ? <p className="t-small secondary">{t("pf.showcaseEmpty")}</p>
              : <ul className="showcase">{showcase(ins.data.achievements).map((a, i) => (
                  <li key={a.id} style={{ ["--i" as string]: i }}><Medal a={a} size={52} /><span>{a.title[lang]}</span></li>
                ))}</ul>}
          </section>
          <section className="card pad stack g16">
            <h3 className="t-h3">{t("rk.title")}</h3>
            <RankLadder xp={me.xp} />
          </section>
          <section className="card pad stack g16">
            <h3 className="t-h3">{t("pf.levelPath")}</h3>
            <Progress value={lp.fraction} />
            <div className="row g8 wrap">
              {CERTIFICATE_LEVELS.slice(0, 7).map((l) => (
                <span key={l} className={`status ${lp.level >= l ? "s-ok" : "s-neutral"}`} title={`${f.num(xpForLevel(l))} XP`}>{t("lvl.short", { n: l })}</span>
              ))}
            </div>
            <p className="t-small muted">{t("pf.certRule")}</p>
          </section>
          <ImpactCounter items={Object.entries(me.impact).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])} />
          {me.role === "volunteer" && <ButtonLink href="/app/wrapped" icon="share">{t("wr.open")}</ButtonLink>}
        </div>
      )}

      {tab === "report" && <MyReport />}

      {tab === "achievements" && (ins.data ? (
        <div className="stack g24">
          <section className="card pad">
            <BadgeShelf items={[
              ...ins.data.achievements.map((a) => ({ id: a.id, rarity: tierRarity(a.tier), done: a.unlocked, value: a.current, goal: a.goal, label: a.title[lang] })),
              ...(game.data?.badges ?? []).map((b) => ({ ...b, label: t(`bd.${b.family}`, { n: b.goal }) })),
            ]} />
          </section>
          <details className="card pad"><summary className="t-h3">{t("bd.details")}</summary><AchievementGrid list={ins.data.achievements} /></details>
        </div>
      ) : <Skeleton rows={4} height={140} />)}

      {tab === "certificates" && (
        !certs.data ? <Skeleton rows={2} height={120} /> : certs.data.length === 0 ? (
          <div className="card"><Empty icon="award" title={t("pf.noCerts")} body={t("pf.noCertsBody", { n: CERTIFICATE_LEVELS.find((l) => l > lp.level) ?? 3 })} /></div>
        ) : (
          <div className="grid auto-fill">
            {certs.data.map((c) => (
              <article key={c.id} className="card pad stack g12">
                <div className="row g12">
                  <span className="avatar" style={{ width: 44, height: 44, background: "var(--accent-soft)", color: "var(--on-accent-soft)" }}><Icon name="award" /></span>
                  <div className="stack">
                    <h3 className="t-h3">{c.level ? t("cert.levelTitle", { n: c.level }) : c.missionTitle}</h3>
                    <span className="t-small secondary">{c.level ? t(levelTitleKey(c.level)) : c.organizationName} · {f.date(c.issuedAt)}</span>
                  </div>
                </div>
                <span className="t-meta">{c.verificationCode}</span>
                <div className="row g8" style={{ marginTop: "auto" }}>
                  <Button variant="primary" size="sm" icon="eye" onClick={() => setOpen(c)}>{t("cert.view")}</Button>
                  <ButtonLink href={`/verify/${c.verificationCode}`} size="sm" variant="ghost" icon="shield">{t("cert.verifyLink")}</ButtonLink>
                </div>
              </article>
            ))}
          </div>
        )
      )}

      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title={open?.level ? t("cert.levelTitle", { n: open.level }) : t("cert.title")} wide>
        {open && <CertificateCanvas c={{ ...open, level: open.level ?? null }} />}
      </Dialog>
    </div>
  );
}

export default function ProfilePage() {
  return <Suspense fallback={null}><Profile /></Suspense>;
}
