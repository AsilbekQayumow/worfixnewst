"use client";
import Link from "next/link";
import { PresetArt } from "@/components/avatar-presets";
import { HeroPlay } from "@/components/hero-play";
import { CATEGORY_ICON, Icon, type IconName } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { CountUp, Reveal, Words } from "@/components/motion";
import { RankBadge } from "@/components/rank";
import { ButtonLink, Skeleton } from "@/components/ui";
import { RANKS } from "@/lib/domain/rewards";
import { CATEGORIES } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

const STEP_TONE = ["var(--sky)", "var(--sun)", "var(--accent)"];

export default function Landing() {
  const { t } = useI18n();
  const f = useFmt();
  const stats = useApi(() => api.publicStats());
  const missions = useApi(() => api.listMissions({ scope: "public" }));
  const open = (missions.data ?? []).filter((m) => m.status === "published");

  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: "map", title: t("ld.how1"), body: t("ld.how1b") },
    { icon: "users", title: t("ld.how2"), body: t("ld.how2b") },
    { icon: "camera", title: t("ld.how3"), body: t("ld.how3b") },
  ];
  const titleWords = t("ld.title1").split(" ").length;

  return (
    <div className="landing v5">
      <section className="hero5">
        <div className="hero5-sky" aria-hidden><span className="b1" /><span className="b2" /><span className="b3" /></div>
        <div className="container hero5-grid">
          <div className="stack g24 hero5-copy">
            <span className="live-chip">
              <span className="pulse-dot" aria-hidden />
              {t("ld.live")}{stats.data ? <> · <strong className="num">{f.num(stats.data.openMissions)}</strong> {t("home.statOpen").toLowerCase()}</> : null}
            </span>
            <h1 className="t-display hero-title">
              <span className="line"><Words text={t("ld.title1")} start={100} /></span>
              <span className="line hero5-accent"><Words text={t("ld.title2")} start={100 + titleWords * 70} /></span>
            </h1>
            <p className="t-lead hero-lead">{t("ld.lead")}</p>
            <div className="row g12 wrap hero-ctas">
              <ButtonLink href="/register" variant="primary" size="lg">{t("ld.start")} <Icon name="arrowRight" size={18} /></ButtonLink>
              <ButtonLink href="/missions" variant="secondary" size="lg" icon="compass">{t("ld.see")}</ButtonLink>
            </div>
            <div className="row g12 hero-kicker">
              <span className="face-stack">{["p02", "p01", "p04", "p07", "p13"].map((id, i) => <span key={id} style={{ ["--i" as string]: i }}><PresetArt id={id} /></span>)}</span>
              <span className="t-small secondary">
                {stats.data && stats.data.volunteers > 0 ? t("ld.joined", { n: f.num(stats.data.volunteers) }) : t("ld.kicker")}
              </span>
            </div>
          </div>
          <HeroPlay />
        </div>
      </section>

      {open.length > 0 && (
        <div className="ticker v5" aria-label={t("home.upcoming")}>
          <div className="ticker-track">
            {[0, 1].map((dup) => (
              <ul key={dup} aria-hidden={dup === 1 || undefined}>
                {open.slice(0, 10).map((m) => (
                  <li key={m.id} className={`cat-${m.category}`}><span className="tk-ico"><Icon name={CATEGORY_ICON[m.category]} size={14} /></span>{m.title}<span className="t-meta">{m.location.split(",")[0]}</span></li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}

      <section className="container section5" id="how">
        <Reveal className="section5-head"><span className="eyebrow">{t("ld.howEyebrow")}</span><h2 className="t-h1">{t("ld.howTitle")}</h2></Reveal>
        <Reveal as="ol" className="steps5">
          {steps.map((s, i) => (
            <li key={s.title} className="step5" style={{ ["--tone" as string]: STEP_TONE[i], ["--i" as string]: i }}>
              <span className="step5-num">{i + 1}</span>
              <span className="step5-ico"><Icon name={s.icon} size={28} /></span>
              <h3 className="t-h2">{s.title}</h3>
              <p className="secondary">{s.body}</p>
            </li>
          ))}
        </Reveal>
      </section>

      <section className="container section5">
        <Reveal className="section5-head"><span className="eyebrow">{t("ld.causesEyebrow")}</span><h2 className="t-h1">{t("ld.causes")}</h2></Reveal>
        <Reveal className="causes5">
          {CATEGORIES.map((c, i) => (
            <Link key={c} href={`/missions?cat=${c}`} className={`cause5 cat-${c}`} style={{ ["--i" as string]: i }}>
              <span className="cause5-ico"><Icon name={CATEGORY_ICON[c]} size={30} /></span>
              <span className="cause5-name">{t(`cat.${c}`)}</span>
              <span className="cause5-count t-small">{t("ld.causeCount", { n: open.filter((m) => m.category === c).length })}</span>
              <Icon name="arrowRight" size={18} className="cause5-go" />
            </Link>
          ))}
        </Reveal>
      </section>

      <section className="container section5">
        <Reveal className="stats5">
          {stats.data ? ([
            [t("home.statActions"), stats.data.verifiedActions, "checkCircle", "var(--accent)"],
            [t("home.statHours"), stats.data.hours, "clock", "var(--sky)"],
            [t("home.statOpen"), stats.data.openMissions, "flag", "var(--flame)"],
            [t("home.statOrgs"), stats.data.organizations, "building", "var(--berry)"],
          ] as const).map(([k, v, icon, tone], i) => (
            <div key={k} className="stat5" style={{ ["--tone" as string]: tone, ["--i" as string]: i }}>
              <span className="stat5-ico"><Icon name={icon} size={20} /></span>
              <span className="stat5-num"><CountUp value={v} format={(n) => f.num(Math.round(n))} /></span>
              <span className="t-small secondary">{k}</span>
            </div>
          )) : <Skeleton rows={1} height={110} />}
        </Reveal>
        {stats.data?.includesDemoData && <p className="t-small muted" style={{ marginTop: 12 }}>{t("home.demoNote")}</p>}
      </section>

      <section className="container section5">
        <Reveal className="ranks5">
          <div className="stack g8">
            <span className="eyebrow">{t("ld.ranksEyebrow")}</span>
            <h2 className="t-h1" style={{ maxWidth: 560 }}>{t("ld.ranksTitle")}</h2>
          </div>
          <ol className="rank-road">
            {RANKS.map((r, i) => (
              <li key={r.id} style={{ ["--i" as string]: i }}>
                <RankBadge rank={r.id} size={64} />
                <strong>{t(`rank.${r.id}`)}</strong>
                <span className="t-meta">{t("lvl.short", { n: r.from })}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="container section5">
        <Reveal className="row between wrap g12" style={{ marginBottom: 20 }}>
          <div className="stack g8"><span className="eyebrow">{t("ld.nearEyebrow")}</span><h2 className="t-h1">{t("home.upcoming")}</h2></div>
          <ButtonLink href="/missions" variant="secondary">{t("home.allMissions")} <Icon name="arrowRight" size={16} /></ButtonLink>
        </Reveal>
        {missions.data ? (
          <Reveal className="grid cols-3 stagger-cards">
            {missions.data.slice(0, 3).map((m, i) => <div key={m.id} style={{ ["--i" as string]: i }} className="lift"><MissionCard m={m} href={`/missions/${m.id}`} /></div>)}
          </Reveal>
        ) : <Skeleton rows={2} height={180} />}
      </section>

      <section className="container section5">
        <Reveal className="org5">
          <div className="stack g12">
            <span className="eyebrow">{t("ld.orgEyebrow")}</span>
            <h2 className="t-h1">{t("home.orgTitle")}</h2>
            <p className="secondary" style={{ maxWidth: 520 }}>{t("home.orgBody")}</p>
            <div className="row g12 wrap" style={{ marginTop: 8 }}>
              <ButtonLink href="/register?type=organization" variant="ink">{t("home.orgCta")}</ButtonLink>
              <ButtonLink href="/organizations" variant="ghost">{t("site.orgs")}</ButtonLink>
            </div>
          </div>
          <ul className="stack g12">
            {(["home.org1", "home.org2", "home.org3"] as const).map((k, i) => (
              <li key={k} className="org5-point" style={{ ["--i" as string]: i }}>
                <span className="org5-tick"><Icon name="check" size={16} strokeWidth={3} /></span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="container section5">
        <Reveal className="cta5">
          <span className="cta5-faces" aria-hidden>{["p10", "p11", "p05", "p16", "p09", "p20"].map((id, i) => <span key={id} style={{ ["--i" as string]: i }}><PresetArt id={id} /></span>)}</span>
          <div className="stack g12" style={{ position: "relative", maxWidth: 560 }}>
            <h2 className="t-h1">{t("ld.ctaTitle")}</h2>
            <p className="cta-body">{t("ld.ctaBody")}</p>
          </div>
          <Link href="/register" className="btn btn-lg cta5-btn">{t("ld.start")} <Icon name="arrowRight" size={18} /></Link>
        </Reveal>
      </section>
    </div>
  );
}
