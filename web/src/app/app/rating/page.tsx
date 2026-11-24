"use client";
import { personColor } from "@/lib/map-colors";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GroupMark } from "@/components/group-bits";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/shell";
import { Avatar, ButtonLink, Empty, Notice, Segmented, Skeleton, Tabs } from "@/components/ui";
import { SCOPES, type Scope } from "@/lib/domain/community";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

type Entity = "volunteers" | "groups";
type Period = "month" | "all";

function Rating() {
  const { t } = useI18n();
  const f = useFmt();
  const router = useRouter();
  const p = useSearchParams();
  const entity: Entity = p.get("entity") === "groups" ? "groups" : "volunteers";
  const scope: Scope = (SCOPES as readonly string[]).includes(p.get("scope") ?? "") ? (p.get("scope") as Scope) : "mahalla";
  const period: Period = p.get("period") === "all" ? "all" : "month";
  const set = (k: string, v: string) => { const n = new URLSearchParams(p.toString()); n.set(k, v); router.replace(`/app/rating?${n.toString()}`, { scroll: false }); };
  const q = useApi(() => api.leaderboard({ entity, scope, period }), [entity, scope, period]);
  const d = q.data;
  const areaName = d ? (scope === "country" ? t("sc.uzbekistan") : scope === "province" ? d.area.province : scope === "district" ? d.area.district : d.area.mahalla) : "";

  return (
    <div className="stack g20 enter">
      <PageHead title={t("rt.title")} sub={t("rt.sub")} />
      <div className="row g12 wrap between">
        <Segmented value={entity} onChange={(v) => set("entity", v)} label={t("rt.who")} items={[{ value: "volunteers", label: t("rt.volunteers") }, { value: "groups", label: t("rt.groups") }]} />
        <Segmented value={period} onChange={(v) => set("period", v)} label={t("rt.period")} items={[{ value: "month", label: t("rt.month") }, { value: "all", label: t("rt.all") }]} />
      </div>
      <Tabs value={scope} onChange={(v) => set("scope", v)} items={SCOPES.map((s) => ({ value: s, label: t(`sc.${s}`) }))} />

      {!d ? <Skeleton rows={6} height={48} /> : d.missing ? (
        entity === "groups" && !d.hasGroup
          ? <div className="card"><Empty icon="users" title={t("rt.noGroup")} body={t("rt.noGroupBody")} action={<ButtonLink href="/app/groups" variant="primary">{t("gr.open")}</ButtonLink>} /></div>
          : <div className="card"><Empty icon="pin" title={t("rt.noArea")} body={t("rt.noAreaBody")} action={<ButtonLink href="/app/settings" variant="primary">{t("rt.fillArea")}</ButtonLink>} /></div>
      ) : (
        <>
          <div className="card pad row g16 wrap rank-me">
            <Icon name="trophy" size={28} className="accent-text" />
            <div className="stack g4 grow">
              <span className="t-small secondary">{t(`sc.${scope}`)} · {areaName}</span>
              <span className="t-h2 num">{d.myRank ? t("rt.yourRank", { n: d.myRank, total: d.total }) : entity === "groups" && !d.hasGroup ? t("rt.noGroupShort") : t("rt.notRanked")}</span>
            </div>
            <span className="t-small muted">{period === "month" ? t("rt.monthHint") : t("rt.allHint")}</span>
          </div>
          {d.rows.length === 0 ? <div className="card"><Empty icon="trophy" title={t("rt.empty")} /></div> : (
            <ol className="card rows board">
              {d.rows.map((r, i) => (
                <li key={r.id} className="row-item" data-me={r.isMe || undefined}>
                  <span className={`board-pos pos-${i + 1}`}>{i + 1}</span>
                  <Link href={entity === "groups" ? `/app/groups/${r.id}` : r.isMe ? "/app/profile" : `/app/people/${r.id}`} className="row g12 grow" style={{ minWidth: 0 }}>
                    {entity === "groups" ? <GroupMark name={r.name} color={r.color} size={36} /> : <span className="map-tint" style={{ ["--tint" as string]: personColor(r.id, "mapColor" in r ? (r.mapColor as string | null) : null) }}><Avatar name={r.name} src={r.avatar} size={36} /></span>}
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>{r.isMe && entity === "volunteers" ? t("a.you") : r.name}</span>
                      <span className="t-small secondary truncate">{t("lvl.short", { n: r.level })}{r.members ? ` · ${t("gr.members", { n: r.members })}` : ""}{r.sub ? ` · ${r.sub}` : ""}</span>
                    </span>
                  </Link>
                  <span className="num" style={{ fontWeight: 600 }}>{f.num(r.xp)} <span className="t-meta">XP</span></span>
                </li>
              ))}
            </ol>
          )}
          {entity === "volunteers" && scope === "mahalla" && <Notice tone="info">{t("rt.privacy")}</Notice>}
        </>
      )}
    </div>
  );
}

export default function RatingPage() {
  return <Suspense fallback={null}><Rating /></Suspense>;
}
