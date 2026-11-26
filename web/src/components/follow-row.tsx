"use client";
/** v6 · feature 12: home row "New from organizations you follow". */
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";
import { MissionCard } from "./mission-card";

export function FollowedMissions() {
  const { t } = useI18n();
  const q = useApi(() => api6.myFollows(), []);
  if (!q.data?.missions.length) return null;
  return (
    <section>
      <div className="section-title"><h2 className="t-h2">{t("fo.fromFollows")}</h2><span className="t-small muted">{t("fo.orgsN", { n: q.data.orgs.length })}</span></div>
      <div className="grid cols-2">{q.data.missions.slice(0, 4).map((m) => <MissionCard key={m.id} m={m} href={`/app/missions/${m.id}`} />)}</div>
    </section>
  );
}

export function MyFollows() {
  const { t } = useI18n();
  const q = useApi(() => api6.myFollows(), []);
  if (!q.data?.orgs.length) return null;
  return (
    <section className="card pad stack g8">
      <h2 className="t-h3">{t("fo.mine")}</h2>
      <div className="row g8 wrap">{q.data.orgs.map((o) => <Link key={o.id} href={`/app/orgs/${o.id}`} className="chip">{o.name}</Link>)}</div>
    </section>
  );
}
