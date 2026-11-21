"use client";
import { AnnouncementBanner } from "@/components/admin-comms";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { OrgForm } from "@/components/org-form";
import { NewsStrip } from "@/components/news";
import { PageHead } from "@/components/shell";
import { ButtonLink, Empty, Notice, Skeleton, Stat, Status } from "@/components/ui";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function OrgHome() {
  const { t } = useI18n();
  const f = useFmt();
  const org = useApi(() => api.myOrganization());
  const stats = useApi(() => (org.data ? api.orgAnalytics() : Promise.resolve(null)), [org.data?.id]);

  if (org.loading && !org.data) return <Skeleton rows={4} />;
  if (!org.data) return (
    <div className="stack g24 enter" style={{ maxWidth: 760 }}>
      <PageHead title={t("org.registerTitle")} sub={t("org.registerSub")} />
      <div className="card pad-lg"><OrgForm org={null} onDone={org.reload} /></div>
    </div>
  );
  const o = org.data;
  const s = stats.data;

  return (
    <div className="stack g24 enter">
      <PageHead title={o.name} sub={<span className="row g8">{o.organizationType} · {o.city}</span>}
        actions={<ButtonLink href="/org/missions/new" variant="primary" icon="plus">{t("nav.newMission")}</ButtonLink>} />

      <AnnouncementBanner />
      {s && s.pending > 0 && <Notice tone="warn">{t("org.toReview", { n: s.pending })} <Link className="link" href="/org/review">{t("nav.review")}</Link></Notice>}
      {o.verificationStatus === "pending" && <Notice tone="warn">{t("org.pendingNote")}</Notice>}
      {o.verificationStatus === "rejected" && <Notice tone="bad"><strong>{t("org.rejected")}</strong> {o.verificationNote}</Notice>}
      {o.verificationStatus === "approved" && <Notice tone="ok">{t("org.approvedNote")}</Notice>}
      <NewsStrip limit={3} />

      {!s ? <Skeleton rows={1} height={100} /> : (
        <>
          <div className="grid cols-4">
            <Stat label={t("org.stat.published")} value={s.published} sub={t("org.stat.drafts", { n: s.drafts })} />
            <Stat label={t("org.stat.volunteers")} value={s.volunteers} />
            <Stat label={t("org.stat.toReview")} value={s.pending} sub={s.pending ? <Link className="link" href="/org/review">{t("nav.review")}</Link> : undefined} />
            <Stat label={t("org.stat.hours")} value={s.hours} sub={t("org.stat.approved", { n: s.approved })} />
          </div>
          <section>
            <div className="section-title"><h2 className="t-h2">{t("org.upcoming")}</h2><Link href="/org/missions" className="t-small link">{t("a.all")}</Link></div>
            {s.upcoming.length === 0 ? <div className="card"><Empty icon="calendar" title={t("org.noUpcoming")} action={<ButtonLink href="/org/missions/new" variant="primary">{t("nav.newMission")}</ButtonLink>} /></div> : (
              <div className="card rows">
                {s.upcoming.map((m) => (
                  <Link key={m.id} href={`/org/missions/${m.id}`} className="row-item">
                    <span className={`cat-${m.category}`}><span className="cat-dot" /></span>
                    <span className="stack grow" style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                      <span className="t-small secondary">{f.dayTime(m.date)}</span>
                    </span>
                    <span className="t-meta">{m.participantsCount} / {m.capacity}</span>
                    <Status tone="ok">{t("ms.published")}</Status>
                    <Icon name="chevronRight" size={16} className="muted" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
