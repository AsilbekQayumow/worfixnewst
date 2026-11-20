"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AgentPanel } from "@/components/agent-panel";
import { CATEGORY_ICON, Icon } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { useMe } from "@/components/providers";
import { PageHead } from "@/components/shell";
import { Button, ButtonLink, Empty, Skeleton, Status, Tabs, VerificationStatusTag } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

type Tab = "active" | "review" | "done";

function MyMissions() {
  const { t } = useI18n();
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [agentOpen, setAgentOpen] = useState(params.get("agent") === "1");
  const [tab, setTab] = useState<Tab>("active");
  const q = useApi(() => api.myParticipations());

  const buckets = useMemo(() => {
    const out: Record<Tab, NonNullable<typeof q.data>> = { active: [], review: [], done: [] };
    for (const x of q.data ?? []) {
      const s = x.submission?.verificationStatus;
      if (s === "approved" || s === "rejected" || x.mission.status === "closed" && !s) out.done.push(x);
      else if (s === "pending") out.review.push(x);
      else out.active.push(x);
    }
    return out;
  }, [q.data]);

  // Group by cause, the volunteer's interests first.
  const groups = useMemo(() => {
    const mine = new Set(me?.interests ?? []);
    const order = [...CATEGORIES].sort((a, b) => Number(mine.has(b)) - Number(mine.has(a)));
    return order.map((c) => ({ cat: c as Category, interest: mine.has(c), items: buckets[tab].filter((x) => x.mission.category === c) })).filter((g) => g.items.length);
  }, [buckets, tab, me]);

  return (
    <div className="stack g24 enter">
      <PageHead
        title={t("nav.myMissions")}
        sub={t("my.sub")}
        actions={!agentOpen && <Button variant="primary" icon="radar" onClick={() => setAgentOpen(true)}>{t("home.app.agent")}</Button>}
      />

      {agentOpen && <AgentPanel onClose={() => setAgentOpen(false)} onSaved={(ids) => { setAgentOpen(false); setTab("active"); if (ids[0]) router.push(`/app/missions/${ids[0]}`); }} />}

      <Tabs value={tab} onChange={setTab} items={[
        { value: "active", label: t("my.active"), count: buckets.active.length },
        { value: "review", label: t("my.review"), count: buckets.review.length },
        { value: "done", label: t("my.done"), count: buckets.done.length },
      ]} />

      {!q.data ? <Skeleton rows={3} height={160} /> : groups.length === 0 ? (
        <div className="card">
          <Empty icon="flag" title={t(`my.empty.${tab}`)} body={tab === "active" ? t("my.emptyBody") : undefined}
            action={tab === "active" ? <div className="row g8"><ButtonLink href="/app/explore" variant="secondary" icon="compass">{t("nav.explore")}</ButtonLink><Button variant="primary" icon="radar" onClick={() => setAgentOpen(true)}>{t("home.app.agent")}</Button></div> : undefined} />
        </div>
      ) : (
        <div className="stack g32">
          {groups.map((g) => (
            <section key={g.cat} className="stack g12">
              <div className="row g12">
                <span className={`row g8 cat-${g.cat}`}><Icon name={CATEGORY_ICON[g.cat]} style={{ color: "var(--cat)" }} /><h2 className="t-h3">{t(`cat.${g.cat}`)}</h2></span>
                <span className="t-meta">{g.items.length}</span>
                {g.interest && <span className="t-small muted">{t("my.yourInterest")}</span>}
              </div>
              <div className="grid auto-fill">
                {g.items.map(({ mission: m, participant: p, submission: s }) => (
                  <MissionCard key={m.id} m={m} href={`/app/missions/${m.id}`}
                    aside={s ? <VerificationStatusTag status={s.verificationStatus} /> : p.startedAt ? <Status tone="info">{t("ms.inProgress")}</Status> : m.source === "agent" ? <Status tone="neutral">{t("md.agentMission")}</Status> : <Status tone="neutral">{t("ms.joined")}</Status>} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyMissionsPage() {
  return <Suspense fallback={null}><MyMissions /></Suspense>;
}
