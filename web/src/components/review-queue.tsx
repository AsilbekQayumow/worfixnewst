"use client";
import { useMemo, useState } from "react";
import { trustPercent } from "@/lib/domain/checks";
import { isAgentOrg } from "@/lib/domain/permissions";
import type { VerificationCheck } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon, type IconName } from "./icons";
import { TileMap } from "./tile-map";
import { Avatar, Button, CategoryTag, DifficultyTag, Empty, Segmented, Skeleton, Status, TextArea, VerificationStatusTag, useToast } from "./ui";

const RESULT_ICON: Record<VerificationCheck["result"], IconName> = { pass: "checkCircle", warn: "alert", fail: "xCircle", skip: "minus" };

function TrustMeter({ score }: { score: number }) {
  const { t } = useI18n();
  const p = trustPercent(score);
  const tone = p >= 75 ? "ok" : p >= 50 ? "warn" : "bad";
  return <Status tone={tone}>{t("rv.trust", { p })}</Status>;
}

export function ReviewQueue({ scope }: { scope: "org" | "admin" }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [source, setSource] = useState<"all" | "agent">(scope === "admin" ? "agent" : "all");
  const q = useApi(() => api.reviewQueue(scope), [scope]);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => (q.data ?? [])
    .filter((x) => (filter === "pending" ? x.submission.verificationStatus === "pending" : true))
    .filter((x) => (source === "agent" ? isAgentOrg(x.submission.organizationId) : true)), [q.data, filter, source]);

  const decide = async (id: string, decision: "approved" | "rejected" | "needs_more_info") => {
    setBusy(id + decision);
    try { await api.review(id, decision, notes[id] ?? ""); toast(t(`rv.done.${decision}`)); setOpen(null); }
    catch (e) { toast(errText(e), "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="stack g16">
      <div className="row g12 wrap">
        <Segmented value={filter} onChange={setFilter} items={[{ value: "pending", label: t("rv.pending") }, { value: "all", label: t("rv.all") }]} />
        {scope === "admin" && <Segmented value={source} onChange={setSource} items={[{ value: "agent", label: t("rv.agentOnly") }, { value: "all", label: t("rv.everything") }]} />}
      </div>
      {scope === "admin" && source === "agent" && <p className="t-small secondary">{t("rv.agentNote")}</p>}
      {!q.data ? <Skeleton rows={3} height={80} /> : list.length === 0 ? <div className="card"><Empty icon="shield" title={t("rv.none")} /></div> : (
        <div className="stack g12">
          {list.map(({ submission: s, mission: m, volunteer: v, participant: p }) => {
            const expanded = open === s.id;
            const checks = s.checks ?? [];
            return (
              <article key={s.id} className="card">
                <button type="button" className="row-item" style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                  <Avatar name={v.fullName} src={v.avatar} size={36} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                    <span className="t-small secondary truncate">{v.fullName} · {f.relative(s.timestamp)}{s.metadata.submissionCount > 1 ? ` · ${t("rv.resubmitted", { n: s.metadata.submissionCount })}` : ""}</span>
                  </span>
                  {s.verificationStatus === "pending" ? <TrustMeter score={s.fraudScore} /> : <VerificationStatusTag status={s.verificationStatus} />}
                  <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} className="muted" />
                </button>
                {expanded && (
                  <div className="split-wide" style={{ padding: "4px 16px 16px", gap: 20 }}>
                    <div className="stack g16" style={{ minWidth: 0 }}>
                      <div className="row g12 wrap"><CategoryTag category={m.category} /><DifficultyTag difficulty={m.difficulty} /><span className="t-small secondary">+{m.rewardXP} XP</span>
                        <span className="t-small muted">{t("lvl.short", { n: v.level })} · {v.city}</span></div>
                      {s.images.length > 0 && (
                        <div className="thumbs" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                          {s.images.map((img, i) => (
                            <a key={i} href={img.dataUrl} target="_blank" rel="noreferrer" className="thumb">
                              <img src={img.dataUrl} alt={t("ev.photoAlt", { n: i + 1 })} />
                              <span className="t-meta">{t(`ev.stage.${img.stage ?? "proof"}`)} · {img.source === "camera" ? t("rv.camera") : t("rv.library")}{img.capturedAt ? ` · ${f.time(img.capturedAt)}` : ""}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {s.notes && <p className="prose t-small">{s.notes}</p>}
                      {s.aiNotes && <p className="t-small secondary row g8" style={{ alignItems: "flex-start" }}><Icon name="scan" size={16} style={{ marginTop: 2 }} />{s.aiNotes}</p>}
                      {(s.checklistDone?.length ?? 0) > 0 && (
                        <ul className="stack g4 t-small">{s.checklistDone!.map((c) => <li key={c} className="row g8"><Icon name="check" size={14} className="accent-text" />{c}</li>)}</ul>
                      )}
                      {m.coordinates && (s.gps || p?.startGps) && (
                        <TileMap height={220} animateRoute={false} markers={[
                          { ...m.coordinates, kind: "target" },
                          ...(s.gps ? [{ ...s.gps, kind: "me" as const }] : []),
                          ...(p?.startGps ? [{ ...p.startGps, kind: "place" as const }] : []),
                        ]} />
                      )}
                    </div>
                    <aside className="stack g16">
                      <div className="inset stack" style={{ padding: "8px 14px" }}>
                        <div className="row between" style={{ padding: "6px 0" }}><span style={{ fontWeight: 500, fontSize: 14 }}>{t("rv.signals")}</span><TrustMeter score={s.fraudScore} /></div>
                        <div className="checks">
                          {checks.map((c) => (
                            <div key={c.id} className="check-row">
                              <Icon name={RESULT_ICON[c.result]} size={18} className={`c-${c.result}`} />
                              <span className="stack"><span style={{ fontWeight: 500 }}>{t(`chk.${c.id}`)}</span><span className="secondary">{t(c.detail, c.values)}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {s.verificationStatus === "pending" ? (
                        <div className="stack g8">
                          <TextArea label={t("rv.note")} hint={t("rv.noteHint")} rows={2} value={notes[s.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />
                          <Button variant="primary" icon="check" loading={busy === s.id + "approved"} onClick={() => decide(s.id, "approved")}>{t("rv.approve", { xp: m.rewardXP })}</Button>
                          <div className="row g8">
                            <Button className="grow" loading={busy === s.id + "needs_more_info"} onClick={() => decide(s.id, "needs_more_info")}>{t("rv.ask")}</Button>
                            <Button className="grow" variant="danger" loading={busy === s.id + "rejected"} onClick={() => decide(s.id, "rejected")}>{t("rv.reject")}</Button>
                          </div>
                        </div>
                      ) : s.reviewNote ? <p className="t-small secondary">{s.reviewNote}</p> : null}
                    </aside>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
