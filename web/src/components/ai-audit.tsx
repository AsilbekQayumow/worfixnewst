"use client";
import { useMemo, useState } from "react";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { AiReviewBox } from "./review-queue";
import { Avatar, Button, CategoryTag, Empty, Segmented, Skeleton, Status, TextArea, VerificationStatusTag, useToast } from "./ui";

/**
 * Admins check the AI reviewer: every decision it made on an agent mission is confirmed or overturned here.
 * Overturning an approval takes back XP, Fixcoin and hours; overturning a rejection sends it to the admin queue.
 */
export function AiAudit() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.aiAuditQueue());
  const [filter, setFilter] = useState<"pending" | "done">("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const list = useMemo(() => (q.data ?? []).filter((x) => (filter === "pending" ? x.submission.aiReview!.audit === "pending" : x.submission.aiReview!.audit !== "pending")), [q.data, filter]);
  const stats = useMemo(() => {
    const done = (q.data ?? []).filter((x) => x.submission.aiReview!.audit === "confirmed" || x.submission.aiReview!.audit === "overturned");
    const over = done.filter((x) => x.submission.aiReview!.audit === "overturned").length;
    return { done: done.length, accuracy: done.length ? Math.round(((done.length - over) / done.length) * 100) : null };
  }, [q.data]);
  const act = async (id: string, verdict: "confirm" | "overturn") => {
    setBusy(id + verdict);
    try { await api.auditAiReview(id, verdict, notes[id] ?? ""); toast(t(`ai.audited.${verdict}`)); setOpen(null); }
    catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  return (
    <div className="stack g16">
      <div className="row between g12 wrap">
        <Segmented value={filter} onChange={setFilter} items={[{ value: "pending", label: t("ai.toCheck") }, { value: "done", label: t("ai.checked") }]} />
        <span className="t-small secondary">{stats.accuracy === null ? t("ai.noStats") : t("ai.accuracy", { p: stats.accuracy, n: stats.done })}</span>
      </div>
      <p className="t-small secondary">{t("ai.auditNote")}</p>
      {!q.data ? <Skeleton rows={3} height={80} /> : list.length === 0 ? <div className="card"><Empty icon="checkCircle" title={filter === "pending" ? t("ai.allChecked") : t("ai.noneChecked")} /></div> : (
        <div className="stack g12">
          {list.map(({ submission: s, mission: m, volunteer: v }) => {
            const r = s.aiReview!;
            const expanded = open === s.id;
            return (
              <article key={s.id} className="card">
                <button type="button" className="row-item" style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                  <Avatar name={v.fullName} src={v.avatar} size={36} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                    <span className="t-small secondary truncate">{v.fullName} · {f.relative(r.at)} · {t("ai.confidence", { p: Math.round(r.confidence * 100) })}</span>
                  </span>
                  <Status tone={r.decision === "approved" ? "ok" : r.decision === "rejected" ? "bad" : "warn"}>{t(`ai.d.${r.decision}`)}</Status>
                  {r.audit !== "pending" && <Status tone={r.audit === "confirmed" ? "ok" : "bad"}>{t(`ai.audit.${r.audit}`)}</Status>}
                  <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} className="muted" />
                </button>
                {expanded && (
                  <div className="split-wide" style={{ padding: "4px 16px 16px", gap: 20 }}>
                    <div className="stack g12" style={{ minWidth: 0 }}>
                      <div className="row g12 wrap"><CategoryTag category={m.category} /><VerificationStatusTag status={s.verificationStatus} /></div>
                      {s.images.length > 0 && (
                        <div className="thumbs" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                          {s.images.map((img, i) => <a key={i} href={img.dataUrl} target="_blank" rel="noreferrer" className="thumb"><img src={img.dataUrl} alt={t("ev.photoAlt", { n: i + 1 })} /><span className="t-meta">{t(`ev.stage.${img.stage ?? "proof"}`)}</span></a>)}
                        </div>
                      )}
                      {s.notes && <p className="prose t-small">{s.notes}</p>}
                      <ul className="stack g4 t-small">{(m.checklist ?? []).map((c) => <li key={c} className="row g8"><Icon name={(s.checklistDone ?? []).includes(c) ? "checkCircle" : "minus"} size={14} />{c}</li>)}</ul>
                    </div>
                    <aside className="stack g12">
                      <AiReviewBox r={r} />
                      {(s.checks ?? []).filter((c) => c.result !== "pass" && c.result !== "skip").map((c) => <span key={c.id} className="t-small secondary row g8"><Icon name="alert" size={14} />{t(`chk.${c.id}`)}: {t(c.detail, c.values)}</span>)}
                      {r.audit === "pending" && (
                        <div className="stack g8">
                          <TextArea label={t("ai.note")} hint={t("ai.noteHint")} rows={2} value={notes[s.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />
                          <Button variant="primary" icon="check" loading={busy === s.id + "confirm"} onClick={() => act(s.id, "confirm")}>{t("ai.confirm")}</Button>
                          <Button variant="danger" icon="x" loading={busy === s.id + "overturn"} onClick={() => act(s.id, "overturn")}>{r.decision === "approved" ? t("ai.overturnApproval") : t("ai.overturnRejection")}</Button>
                        </div>
                      )}
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
