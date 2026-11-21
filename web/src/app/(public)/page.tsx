"use client";
import Link from "next/link";
import { HeroScene, Leaves } from "@/components/hero-scene";
import { Icon, type IconName } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { CountUp, Reveal, Words } from "@/components/motion";
import { RankBadge } from "@/components/rank";
import { ButtonLink, Skeleton } from "@/components/ui";
import { RANKS } from "@/lib/domain/rewards";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function Landing() {
  const { t } = useI18n();
  const f = useFmt();
  const stats = useApi(() => api.publicStats());
  const missions = useApi(() => api.listMissions({ scope: "public" }));
  const open = (missions.data ?? []).filter((m) => m.status === "published");

  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: "radar", title: t("ld.how1"), body: t("ld.how1b") },
    { icon: "users", title: t("ld.how2"), body: t("ld.how2b") },
    { icon: "camera", title: t("ld.how3"), body: t("ld.how3b") },
  ];
  const titleWords = t("ld.title1").split(" ").length;

  return (
    <div className="landing">
      <section className="hero hero-v31">
        <div className="hero-glow" aria-hidden />
        <div className="container hero-grid">
          <div className="stack g24 hero-copy">
            <span className="live-chip">
              <span className="pulse-dot" aria-hidden />
              {t("ld.live")}{stats.data ? <> · <strong className="num">{f.num(stats.data.openMissions)}</strong> {t("home.statOpen").toLowerCase()}</> : null}
            </span>
            <h1 className="t-display hero-title">
              <span className="line"><Words text={t("ld.title1")} start={120} /></span>
              <span className="line hero-accent">
                <Words text={t("ld.title2")} start={120 + titleWords * 70} />
                <svg className="scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden>
                  <path d="M3 13 C 60 4, 120 4, 170 9 S 260 15, 297 6" pathLength={1} />
                </svg>
              </span>
            </h1>
            <p className="t-lead hero-lead">{t("ld.lead")}</p>
            <div className="row g12 wrap hero-ctas">
              <ButtonLink href="/register" variant="primary" size="lg" className="btn-shine">{t("ld.start")} <Icon name="arrowRight" size={18} /></ButtonLink>
              <ButtonLink href="/missions" variant="ghost" size="lg" icon="compass">{t("ld.see")}</ButtonLink>
            </div>
            <span className="t-small muted hero-kicker">{t("ld.kicker")}</span>
          </div>
          <HeroScene />
        </div>
        <a href="#how" className="scroll-cue" aria-label={t("ld.scroll")}><span /></a>
      </section>

      {open.length > 0 && (
        <div className="ticker" aria-label={t("home.upcoming")}>
          <div className="ticker-track">
            {[0, 1].map((dup) => (
              <ul key={dup} aria-hidden={dup === 1 || undefined}>
                {open.slice(0, 10).map((m) => (
                  <li key={m.id}><span className={`cat-dot cat-${m.category}`} />{m.title}<span className="t-meta">{m.location.split(",")[0]}</span></li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}

      <section className="container" style={{ marginTop: 56 }}>
        <Reveal className="panel stats-panel">
          {stats.data ? (
            <div className="grid cols-4">
              {([
                [t("home.statActions"), stats.data.verifiedActions, "checkCircle"],
                [t("home.statHours"), stats.data.hours, "clock"],
                [t("home.statOpen"), stats.data.openMissions, "flag"],
                [t("home.statOrgs"), stats.data.organizations, "building"],
              ] as const).map(([k, v, icon], i) => (
                <div key={k} className="stack g4 stat-cell" style={{ ["--i" as string]: i }}>
                  <Icon name={icon} size={18} className="accent-text" />
                  <span className="stat-value stat-big"><CountUp value={v} format={(n) => f.num(Math.round(n))} /></span>
                  <span className="t-small secondary">{k}</span>
                </div>
              ))}
            </div>
          ) : <Skeleton rows={1} />}
          {stats.data?.includesDemoData && <p className="t-small muted" style={{ marginTop: 12 }}>{t("home.demoNote")}</p>}
        </Reveal>
      </section>

      <section className="container section-gap" id="how">
        <Reveal><h2 className="t-h1 section-heading">{t("ld.howTitle")}</h2></Reveal>
        <Reveal className="how3">
          <svg className="how-trail" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden>
            <path d="M0,30 C150,0 250,60 400,30 S650,0 800,30 S950,45 1000,30" pathLength={1} />
          </svg>
          <ol className="grid cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="card pad-lg how-card" style={{ ["--i" as string]: i }}>
                <span className="how-num num">0{i + 1}</span>
                <span className="how-icon"><Icon name={s.icon} size={22} /></span>
                <h3 className="t-h3">{s.title}</h3>
                <p className="t-small secondary">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="container section-gap">
        <Reveal className="panel ranks-panel">
          <h2 className="t-h2" style={{ maxWidth: 520 }}>{t("ld.ranksTitle")}</h2>
          <ol className="rank-road">
            {RANKS.map((r, i) => (
              <li key={r.id} style={{ ["--i" as string]: i }}>
                <RankBadge rank={r.id} size={56} />
                <strong>{t(`rank.${r.id}`)}</strong>
                <span className="t-meta">{t("lvl.short", { n: r.from })}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="container section-gap">
        <Reveal className="row between wrap g12" style={{ marginBottom: 20 }}>
          <h2 className="t-h1">{t("home.upcoming")}</h2>
          <Link href="/missions" className="btn btn-ghost">{t("home.allMissions")} <Icon name="arrowRight" size={16} /></Link>
        </Reveal>
        {missions.data ? (
          <Reveal className="grid cols-3 stagger-cards">
            {missions.data.slice(0, 3).map((m, i) => <div key={m.id} style={{ ["--i" as string]: i }} className="lift"><MissionCard m={m} href={`/missions/${m.id}`} /></div>)}
          </Reveal>
        ) : <Skeleton rows={2} height={180} />}
      </section>

      <section className="container section-gap">
        <Reveal className="panel split" style={{ padding: 32 }}>
          <div className="stack g12">
            <h2 className="t-h1">{t("home.orgTitle")}</h2>
            <p className="secondary" style={{ maxWidth: 520 }}>{t("home.orgBody")}</p>
            <div className="row g12 wrap" style={{ marginTop: 8 }}>
              <ButtonLink href="/register?type=organization" variant="ink">{t("home.orgCta")}</ButtonLink>
              <ButtonLink href="/organizations" variant="ghost">{t("site.orgs")}</ButtonLink>
            </div>
          </div>
          <ul className="stack g12">
            {(["home.org1", "home.org2", "home.org3"] as const).map((k) => (
              <li key={k} className="row g12" style={{ alignItems: "flex-start" }}>
                <Icon name="check" size={18} style={{ color: "var(--accent)", marginTop: 2 }} />
                <span className="secondary">{t(k)}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="container section-gap">
        <Reveal className="cta-band">
          <Leaves />
          <div className="stack g12" style={{ position: "relative", maxWidth: 560 }}>
            <h2 className="t-h1">{t("ld.ctaTitle")}</h2>
            <p className="cta-body">{t("ld.ctaBody")}</p>
          </div>
          <ButtonLink href="/register" size="lg" className="cta-btn btn-shine">{t("ld.start")} <Icon name="arrowRight" size={18} /></ButtonLink>
        </Reveal>
      </section>
    </div>
  );
}
