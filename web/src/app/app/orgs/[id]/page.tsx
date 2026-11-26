"use client";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { useMe } from "@/components/providers";
import { Avatar, ButtonLink, Empty, Skeleton } from "@/components/ui";
import { FollowButton, OrgRatingLine, ReportButton, Stars } from "@/components/v6-bits";
import { useFmt, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";

/** v6 · feature 12: an organization's page — follow, rating (feature 7), upcoming missions, report (feature 8). */
export default function OrgPage() {
  const { t } = useI18n();
  const f = useFmt();
  const { me } = useMe();
  const { id } = useParams<{ id: string }>();
  const q = useApi(() => api6.orgPage(id), [id]);
  if (q.loading && !q.data) return <Skeleton rows={3} height={120} />;
  if (!q.data) return <div className="card"><Empty icon="building" title={t("fo.notFound")} action={<ButtonLink href="/app/map?view=list&tab=explore">{t("md.back")}</ButtonLink>} /></div>;
  const { org, rating } = q.data;
  const tags = Object.entries(rating.tags).sort((a, b) => b[1] - a[1]);
  return (
    <div className="stack g24 enter">
      <section className="card pad-lg stack g16">
        <div className="row g16 wrap">
          <Avatar name={org.name} src={org.logo} size={72} />
          <div className="stack g4 grow" style={{ minWidth: 200 }}>
            <h1 className="t-h1">{org.name}</h1>
            <span className="t-small secondary row g8 wrap">
              {org.city && <span className="row g4"><Icon name="pin" size={14} />{org.city}</span>}
              {org.organizationType && <span>{org.organizationType}</span>}
              <span className="row g4"><Icon name="users" size={14} />{t("fo.followers", { n: q.data.followers })}</span>
            </span>
            <OrgRatingLine score={rating.score} count={rating.count} isNew={rating.isNew} />
          </div>
          <div className="row g8">
            {me?.role === "volunteer" && !q.data.mine && <FollowButton orgId={org.id} following={q.data.following} onChange={q.reload} />}
            {me && !q.data.mine && <ReportButton type="organization" id={org.id} />}
          </div>
        </div>
        {org.description && <p className="prose">{org.description}</p>}
        <div className="row g20 wrap t-small secondary">
          <span><strong className="num">{org.totalMissions}</strong> {t("fo.missionsDone")}</span>
          <span><strong className="num">{org.totalVolunteers}</strong> {t("fo.volunteers")}</span>
          {org.website && <a className="link" href={org.website} target="_blank" rel="noopener noreferrer">{org.website.replace(/^https?:\/\//, "")}</a>}
        </div>
      </section>

      {(tags.length > 0 || rating.comments.length > 0) && (
        <section className="card pad stack g12">
          <h2 className="t-h2">{t("rat.what")}</h2>
          {tags.length > 0 && <div className="row g8 wrap">{tags.map(([k, n]) => <span key={k} className="chip">{t(`rat.tag.${k}`)} · {Math.round((n / Math.max(1, rating.count)) * 100)}%</span>)}</div>}
          {rating.comments.map((c) => (
            <div key={c.id} className="inset stack g4" style={{ padding: 12 }}>
              <span className="row g8"><Stars value={c.stars} size={14} /><span className="t-meta">{f.date(c.at)}</span></span>
              <p className="t-small">{c.comment}</p>
            </div>
          ))}
        </section>
      )}

      <section className="stack g12">
        <h2 className="t-h2">{t("fo.upcoming")}</h2>
        {q.data.missions.length === 0
          ? <div className="card"><Empty icon="flag" title={t("fo.noMissions")} body={q.data.following ? t("fo.willTell") : t("fo.followToHear")} /></div>
          : <div className="grid cols-2">{q.data.missions.map((m) => <MissionCard key={m.id} m={m} href={`/app/missions/${m.id}`} />)}</div>}
      </section>
    </div>
  );
}
