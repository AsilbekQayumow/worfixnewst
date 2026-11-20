"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { CATEGORY_ICON, Icon } from "./icons";
import { MissionCard } from "./mission-card";
import { useMe } from "./providers";
import { Empty, Skeleton } from "./ui";

/** Browse published missions. Interest-matching causes are listed first for signed-in volunteers. */
export function Explore({ base }: { base: "/missions" | "/app/missions" }) {
  const { t } = useI18n();
  const { me } = useMe();
  const [cat, setCat] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const list = useApi(() => api.listMissions({ scope: "public", category: cat, q }), [cat, q]);
  const cats = useMemo(() => {
    const mine = new Set(me?.interests ?? []);
    return [...CATEGORIES].sort((a, b) => Number(mine.has(b)) - Number(mine.has(a)));
  }, [me]);

  return (
    <div className="stack g20">
      <div className="row g12 wrap">
        <div className="input-wrap grow" style={{ maxWidth: 360, minWidth: 220 }}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ex.search")} aria-label={t("ex.search")} style={{ paddingLeft: 36, paddingRight: 12 }} />
          <span style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }}><Icon name="search" size={18} /></span>
        </div>
        <div className="row g8 wrap" role="group" aria-label={t("ex.filter")}>
          <button type="button" className="chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t("ex.all")}</button>
          {cats.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              <Icon name={CATEGORY_ICON[c]} size={16} />{t(`cat.${c}`)}
            </button>
          ))}
        </div>
      </div>
      {!list.data ? <Skeleton rows={3} height={200} /> : list.data.length === 0 ? (
        <div className="card"><Empty icon="search" title={t("ex.none")} body={t("ex.noneBody")} /></div>
      ) : (
        <div className="grid auto-fill">
          {list.data.map((m) => <MissionCard key={m.id} m={m} href={`${base}/${m.id}`} />)}
        </div>
      )}
    </div>
  );
}
