"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { TileMap } from "@/components/tile-map";
import { Avatar, Button, Checkbox, Dialog, Empty, Notice, Select, Skeleton, Status, TextArea, useToast } from "@/components/ui";
import { EmergencyNumbers, SkillChips } from "@/components/v6-bits";
import { EMERGENCY_ROLES, type EmergencyRole } from "@/lib/domain/emergency";
import { skillName } from "@/lib/domain/skills";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";

const SAFETY_KEY = "worfix.em.safety";

/** v6 · feature 19: one emergency — the official numbers first, then what is needed, who is going, and the coordinator's tools. */
export default function EmergencyPage() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const { id } = useParams<{ id: string }>();
  const q = useApi(() => api6.emergency(id), [id]);
  const [going, setGoing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  if (q.data === undefined) return <Skeleton rows={4} />;
  if (!q.data) return <div className="card"><Empty icon="alert" title={t("em.notFound")}  /></div>;
  const e = q.data;
  const resolved = e.state === "resolved";
  return (
    <div className="stack g24 enter">
      <EmergencyNumbers />
      <section className="card pad-lg stack g12 em-head" data-state={e.state}>
        <div className="row g8 wrap">
          <Status tone={resolved ? "neutral" : "bad"}>{resolved ? t("em.resolved") : t("em.verified")}</Status>
          <Status tone="neutral">{t(`em.k.${e.type}`)}</Status>
        </div>
        <h1 className="t-h1">{e.title}</h1>
        <span className="t-small secondary row g12 wrap">
          <span className="row g4"><Icon name="pin" size={14} />{e.place}</span>
          <span className="row g4"><Icon name="clock" size={14} />{f.relative(e.createdAt)}</span>
          <span className="row g4"><Icon name="users" size={14} />{t("em.going", { n: e.goingCount })}</span>
        </span>
        {e.note && <p className="prose">{e.note}</p>}
        {resolved && e.closingNote && <Notice tone="ok">{e.closingNote}</Notice>}
      </section>

      <div className="split-wide">
        <div className="stack g16" style={{ minWidth: 0 }}>
          <TileMap height={240} markers={[{ ...e.location, kind: "target" }]} animateRoute={false} />
          {e.needs.length > 0 && (
            <section className="card pad stack g8">
              <h2 className="t-h3">{t("em.needs")}</h2>
              <div className="row g8 wrap">{e.needs.map((n) => <span key={n} className="chip">{skillName(n, lang)}</span>)}</div>
            </section>
          )}
          {e.meetingPoints.length > 0 && (
            <section className="card pad stack g8">
              <h2 className="t-h3">{t("em.points")}</h2>
              <ul className="stack g8">{e.meetingPoints.map((p) => <li key={p} className="row g8"><Icon name="flag" size={16} />{p}</li>)}</ul>
            </section>
          )}
          {e.contacts && <section className="card pad stack g8"><h2 className="t-h3">{t("em.contacts")}</h2><p className="t-small">{e.contacts}</p></section>}
          {e.coordinator && e.responders.length > 0 && (
            <section className="card pad stack g12">
              <h2 className="t-h3">{t("em.responders")}</h2>
              {e.responders.map((r) => (
                <div key={r.id} className="row g12 wrap">
                  <Avatar name={r.name} src={r.avatar} size={36} />
                  <span className="stack grow" style={{ minWidth: 160 }}>
                    <strong>{r.name}</strong>
                    <span className="t-small muted">{t(`em.role.${r.role}`)}{r.point ? ` · ${r.point}` : ""} · {r.province}</span>
                    <SkillChips ids={r.skills.slice(0, 4)} />
                  </span>
                  {!resolved && <Checkbox checked={Boolean(r.confirmed)} onChange={(v) => run(`c${r.id}`, () => api6.confirmResponder(e.id, r.id, v))}>{t("em.confirm")}</Checkbox>}
                </div>
              ))}
              <p className="t-small muted">{t("em.confirmHint")}</p>
            </section>
          )}
        </div>

        <aside className="stack g12">
          {!resolved && (e.canRespond ? (
            e.myGoing ? (
              <div className="card pad stack g12">
                <Notice tone="ok">{t("em.youGo", { role: t(`em.role.${e.myGoing.role}`) })}</Notice>
                <Button variant="ghost" loading={busy === "no"} onClick={() => run("no", () => api6.respondEmergency(e.id, null))}>{t("em.cancelGo")}</Button>
              </div>
            ) : <Button variant="primary" size="lg" block icon="hands" onClick={() => setGoing(true)}>{t("em.go")}</Button>
          ) : <Notice tone="info">{t("em.minor")}</Notice>)}
          {e.coordinator && !resolved && <Button block icon="check" onClick={() => setClosing(true)}>{t("em.close")}</Button>}
          <p className="t-small muted">{t("em.valid", { when: f.dayTime(e.validUntil) })}</p>
        </aside>
      </div>

      {going && <GoDialog points={e.meetingPoints} onClose={() => setGoing(false)} onGo={(role, point) => run("go", async () => { await api6.respondEmergency(e.id, { role, point }); setGoing(false); }, t("em.thanksGo"))} />}
      {closing && <CloseDialog onClose={() => setClosing(false)} onDone={(note) => run("close", async () => { await api6.closeEmergency(e.id, note); setClosing(false); }, t("em.closed"))} />}
    </div>
  );
}

function GoDialog({ points, onClose, onGo }: { points: string[]; onClose: () => void; onGo: (role: EmergencyRole, point: string) => void }) {
  const { t } = useI18n();
  const [role, setRole] = useState<EmergencyRole>("general");
  const [point, setPoint] = useState(points[0] ?? "");
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(SAFETY_KEY) === "1"; } catch { return false; } });
  return (
    <Dialog open onClose={onClose} title={t("em.go")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" disabled={!ok} onClick={() => { try { localStorage.setItem(SAFETY_KEY, "1"); } catch { /* private mode */ } onGo(role, point); }}>{t("em.goConfirm")}</Button>
    </>}>
      <div className="stack g12">
        <Select label={t("em.role")} value={role} onChange={(x) => setRole(x.target.value as EmergencyRole)}>
          {EMERGENCY_ROLES.map((r) => <option key={r} value={r}>{t(`em.role.${r}`)}</option>)}
        </Select>
        {points.length > 0 && (
          <Select label={t("em.point")} value={point} onChange={(x) => setPoint(x.target.value)}>
            {points.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        )}
        <div className="inset stack g8" style={{ padding: 12 }}>
          <strong className="t-small">{t("em.safetyTitle")}</strong>
          <ol className="t-small secondary stack g4" style={{ paddingLeft: 18 }}>
            {[1, 2, 3, 4].map((i) => <li key={i}>{t(`em.safety${i}`)}</li>)}
          </ol>
        </div>
        <Checkbox checked={ok} onChange={setOk}>{t("em.safetyOk")}</Checkbox>
        <p className="t-small muted">{t("em.shareNote")}</p>
      </div>
    </Dialog>
  );
}

function CloseDialog({ onClose, onDone }: { onClose: () => void; onDone: (note: string) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  return (
    <Dialog open onClose={onClose} title={t("em.close")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" onClick={() => onDone(note)}>{t("em.closeConfirm")}</Button>
    </>}>
      <div className="stack g12">
        <p className="t-small secondary">{t("em.closeBody")}</p>
        <TextArea label={t("em.closeNote")} value={note} rows={3} maxLength={500} onChange={(x) => setNote(x.target.value)} />
      </div>
    </Dialog>
  );
}
