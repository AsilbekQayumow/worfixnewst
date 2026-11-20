"use client";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { TopoMap } from "@/components/topo";
import { ButtonLink, Coins, Skeleton } from "@/components/ui";
import { DIFFICULTY_REWARD } from "@/lib/domain/rewards";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function Landing() {
  const { t } = useI18n();
  const f = useFmt();
  const stats = useApi(() => api.publicStats());
  const missions = useApi(() => api.listMissions({ scope: "public" }));

  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: "radar", title: t("home.s1t"), body: t("home.s1b") },
    { icon: "route", title: t("home.s2t"), body: t("home.s2b") },
    { icon: "camera", title: t("home.s3t"), body: t("home.s3b") },
    { icon: "award", title: t("home.s4t"), body: t("home.s4b") },
  ];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="stack g24 enter">
            <h1 className="t-display">{t("home.title")}</h1>
            <p className="t-lead">{t("home.lead")}</p>
            <div className="row g12 wrap">
              <ButtonLink href="/register" variant="primary" size="lg">{t("home.cta")}</ButtonLink>
              <ButtonLink href="/missions" variant="ghost" size="lg" icon="compass">{t("home.cta2")}</ButtonLink>
            </div>
          </div>

          <div style={{ position: "relative", paddingBottom: 24 }}>
            <div className="topo-card"><TopoMap /></div>
            <div className="float-card float-mission" style={{ bottom: 0, width: 280, padding: 16 }}>
              <div className="row between g8" style={{ marginBottom: 8 }}>
                <span className="tag cat-environment"><span className="cat-dot" />{t("cat.environment")}</span>
                <span className="t-meta">1.2 km</span>
              </div>
              <p style={{ fontWeight: 500, marginBottom: 12 }}>{t("home.demoMission")}</p>
              <div className="row between" style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 10 }}>
                <span className="status s-ok">{t("vs.approved")}</span>
                <span className="row g12 t-small num"><span style={{ fontWeight: 500 }}>+{DIFFICULTY_REWARD.medium.xp} XP</span><Coins value={`+${DIFFICULTY_REWARD.medium.coins}`} size={14} /></span>
              </div>
            </div>
            <div className="float-card" style={{ right: 16, top: 20, padding: "10px 14px" }}>
              <span className="row g8 t-small"><Icon name="award" size={16} /> {t("home.levelCert", { n: 5 })}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="panel" style={{ padding: "20px 24px" }}>
          {stats.data ? (
            <div className="grid cols-4">
              {[
                [t("home.statActions"), f.num(stats.data.verifiedActions)],
                [t("home.statHours"), f.num(stats.data.hours)],
                [t("home.statOpen"), f.num(stats.data.openMissions)],
                [t("home.statOrgs"), f.num(stats.data.organizations)],
              ].map(([k, v]) => (
                <div key={k} className="stack g4">
                  <span className="stat-value">{v}</span>
                  <span className="t-small secondary">{k}</span>
                </div>
              ))}
            </div>
          ) : <Skeleton rows={1} />}
          {stats.data?.includesDemoData && <p className="t-small muted" style={{ marginTop: 12 }}>{t("home.demoNote")}</p>}
        </div>
      </section>

      <section className="container" style={{ marginTop: 96 }}>
        <h2 className="t-h1" style={{ maxWidth: 640, marginBottom: 40 }}>{t("home.howTitle")}</h2>
        <div style={{ position: "relative" }}>
          <svg className="how-trail" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", left: 20, right: 20, top: 2, width: "calc(100% - 40px)", height: 40 }}>
            <path d="M0,20 C150,0 250,40 400,20 S650,0 800,20 S950,30 1000,20" fill="none" stroke="var(--line-strong)" strokeWidth={2.5} strokeDasharray="1 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="grid cols-4" style={{ position: "relative", gap: 32 }}>
            {steps.map((s) => (
              <li key={s.title} className="stack g12">
                <span style={{ width: 44, height: 44, borderRadius: 22, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
                  <Icon name={s.icon} size={20} />
                </span>
                <h3 className="t-h3">{s.title}</h3>
                <p className="t-small secondary">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container" style={{ marginTop: 96 }}>
        <div className="row between wrap g12" style={{ marginBottom: 20 }}>
          <h2 className="t-h1">{t("home.upcoming")}</h2>
          <Link href="/missions" className="btn btn-ghost">{t("home.allMissions")} <Icon name="arrowRight" size={16} /></Link>
        </div>
        {missions.data ? (
          <div className="grid cols-3">
            {missions.data.slice(0, 3).map((m) => <MissionCard key={m.id} m={m} href={`/missions/${m.id}`} />)}
          </div>
        ) : <Skeleton rows={2} height={180} />}
      </section>

      <section className="container" style={{ marginTop: 96 }}>
        <div className="panel split" style={{ padding: 32 }}>
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
        </div>
      </section>
    </>
  );
}
