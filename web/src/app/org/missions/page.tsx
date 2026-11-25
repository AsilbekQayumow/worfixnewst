"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/shell";
import { ButtonLink, Empty, MISSION_STATUS_TONE as STATUS_TONE, Segmented, Skeleton, Status } from "@/components/ui";
import type { MissionStatus } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function OrgMissions() {
  const { t } = useI18n();
  const f = useFmt();
  const [filter, setFilter] = useState<"all" | MissionStatus>("all");
  const q = useApi(() => api.listMissions({ scope: "mine" }));
  const list = (q.data ?? []).filter((m) => filter === "all" || m.status === filter);
  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.orgMissions")} actions={<ButtonLink href="/org/missions/new" variant="primary" icon="plus">{t("nav.newMission")}</ButtonLink>} />
      <Segmented value={filter} onChange={setFilter} items={[
        { value: "all", label: t("a.all") }, { value: "draft", label: t("ms.draft") }, { value: "published", label: t("ms.published") }, { value: "closed", label: t("ms.closed") },
      ]} />
      {!q.data ? <Skeleton rows={4} /> : list.length === 0 ? <div className="card"><Empty icon="flag" title={t("org.noMissions")} action={<ButtonLink href="/org/missions/new" variant="primary">{t("nav.newMission")}</ButtonLink>} /></div> : (
        <div className="card rows">
          {list.map((m) => (
            <Link key={m.id} href={`/org/missions/${m.id}`} className="row-item mrow">
              <span className={`cat-${m.category}`}><span className="cat-dot" /></span>
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                <span className="t-small secondary truncate">{f.dayTime(m.date)} · {m.location}</span>
              </span>
              <span className="mrow-side"><span className="t-meta">{m.participantsCount} / {m.capacity}</span><Status tone={STATUS_TONE[m.status]}>{t(`ms.${m.status}`)}</Status></span>
              <Icon name="chevronRight" size={16} className="muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
