"use client";
/** v7: admins add mahallas people say are missing from the list. */
import { useState } from "react";
import { districtById, REGIONS } from "@/lib/game/places";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api7 } from "@/lib/store/api7";
import { useApi } from "@/lib/store/hooks";
import { Button, Empty, Skeleton, TextInput, useToast } from "./ui";

export function AdminPlaces() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api7.placeRequests(), []);
  const [names, setNames] = useState<Record<string, string>>({});
  const decide = async (id: string, add: boolean) => {
    try { await api7.decidePlace(id, add, names[id]); toast(add ? t("pl.ad.added") : t("pl.ad.rejected")); } catch (e) { toast(errText(e), "error"); }
  };
  if (!q.data) return <Skeleton rows={3} />;
  if (!q.data.length) return <div className="card"><Empty icon="pin" title={t("pl.ad.empty")} body={t("pl.ad.emptyBody")} /></div>;
  return (
    <div className="card rows">
      {q.data.map((r) => {
        const d = districtById(r.districtId);
        const region = d ? REGIONS.find((x) => x.id === d.r) : null;
        return (
          <div key={r.id} className="row-item g12 wrap" style={{ alignItems: "flex-end" }}>
            <div className="stack g4 grow" style={{ minWidth: 220 }}>
              <span className="t-small secondary">{[region?.uz, d?.uz].filter(Boolean).join(" · ")} · {r.who} · {f.relative(r.createdAt)}</span>
              <TextInput aria-label={t("pl.ad.name")} value={names[r.id] ?? r.name} onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))} />
            </div>
            <div className="row g8">
              <Button size="sm" variant="primary" onClick={() => void decide(r.id, true)}>{t("pl.ad.add")}</Button>
              <Button size="sm" variant="ghost" onClick={() => void decide(r.id, false)}>{t("pl.ad.reject")}</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
