"use client";
import Link from "next/link";
import { useState } from "react";
import { DEFAULT_RADIUS_M } from "@/lib/domain/checks";
import { levelTitleKey } from "@/lib/domain/rewards";
import type { GpsFix } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { getPosition } from "@/lib/store/media";
import { EvidenceForm } from "./evidence-form";
import { AiReviewBox } from "./review-queue";
import { SignalDialog } from "./signals";
import { Icon } from "./icons";
import { useMe } from "./providers";
import { RoutePanel } from "./route-panel";
import { TileMap } from "./tile-map";
import {
  Avatar, Button, ButtonLink, CategoryTag, Coins, DifficultyTag, Dialog, Empty, Notice, Skeleton, Status, VerificationStatusTag, useToast,
} from "./ui";

export function MissionDetail({ id, inApp }: { id: string; inApp: boolean }) {
  const { t } = useI18n();
  const f = useFmt();
  const errText = useErrorText();
  const toast = useToast();
  const { me } = useMe();
  const q = useApi(() => api.getMission(id), [id]);
  const st = useApi(() => api.missionState(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [signal, setSignal] = useState(false);
  const [fix, setFix] = useState<GpsFix | null>(null);

  if (q.loading && !q.data) return <Skeleton rows={4} height={120} />;
  if (!q.data) return <div className="card"><Empty icon="flag" title={t("md.notFound")} action={<ButtonLink href={inApp ? "/app/missions?tab=explore" : "/missions"}>{t("md.back")}</ButtonLink>} /></div>;

  const m = q.data.mission;
  const s = st.data;
  const p = s?.participant;
  const joined = p?.status === "accepted";
  const sub = s?.submission ?? null;
  const started = Boolean(p?.startedAt);
  const startsIn = Date.parse(m.date) - Date.now();
  const canStart = startsIn <= 2 * 3_600_000;
  const radius = m.radiusM ?? DEFAULT_RADIUS_M;

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  const start = () => act("start", async () => {
    const gps = await getPosition(10_000).catch(() => null);
    if (gps) setFix(gps);
    await api.startMission(m.id, gps);
  }, t("md.startedToast"));

  const spots = Math.max(0, m.capacity - m.participantsCount);

  return (
    <div className="stack g24 enter">
      <div className="stack g12">
        <Link href={inApp ? (joined ? "/app/missions" : "/app/missions?tab=explore") : "/missions"} className="row g8 t-small secondary" style={{ width: "fit-content" }}>
          <Icon name="arrowLeft" size={16} /> {inApp && joined ? t("nav.myMissions") : t("md.back")}
        </Link>
        <div className="row g12 wrap">
          <CategoryTag category={m.category} withIcon />
          <DifficultyTag difficulty={m.difficulty} />
          {m.source === "agent" && <Status tone="info">{t("md.agentMission")}</Status>}
          {m.isDemo && <Status tone="neutral">{t("md.demo")}</Status>}
          {m.status !== "published" && <Status tone="neutral">{t(`ms.${m.status}`)}</Status>}
        </div>
        <h1 className="t-h1" style={{ maxWidth: 820 }}>{m.title}</h1>
        <div className="row g20 wrap t-small secondary">
          <span className="row g8"><Icon name="pin" size={16} />{m.location}</span>
          <span className="row g8"><Icon name="calendar" size={16} />{f.dayTime(m.date)}</span>
          <span className="row g8"><Icon name="clock" size={16} />{f.duration(m.duration)}</span>
          {m.organizationName && <span className="row g8"><Icon name="building" size={16} />{m.organizationName}</span>}
        </div>
      </div>

      <div className="split-wide">
        <div className="stack g24" style={{ minWidth: 0 }}>
          {joined && started && m.coordinates && sub?.verificationStatus !== "approved" ? (
            <section className="card pad stack g12">
              <div className="row between g8"><h2 className="t-h2">{t("md.route")}</h2><span className="t-meta">{f.coords(m.coordinates.lat, m.coordinates.lng)}</span></div>
              <RoutePanel target={m.coordinates} radiusM={radius} onFix={setFix} />
            </section>
          ) : m.coordinates ? (
            <section className="stack g8">
              <TileMap height={260} markers={[{ ...m.coordinates, kind: "target" }]} animateRoute={false} />
              <span className="t-meta">{f.coords(m.coordinates.lat, m.coordinates.lng)} · {t("md.radius", { m: radius })}</span>
            </section>
          ) : null}

          {joined && started && sub?.verificationStatus !== "approved" && sub?.verificationStatus !== "rejected" && (!sub || sub.verificationStatus === "needs_more_info") && (
            <section className="card pad-lg stack g16" id="evidence">
              <h2 className="t-h2">{t("md.evidence")}</h2>
              {sub?.verificationStatus === "needs_more_info" && <Notice tone="info"><strong>{t("md.reviewerAsks")}</strong> {sub.reviewNote}</Notice>}
              <EvidenceForm mission={m} resubmission={Boolean(sub)} lastFix={fix} />
            </section>
          )}

          <section className="stack g12">
            <h2 className="t-h2">{t("md.about")}</h2>
            <p className="prose">{m.description}</p>
            {m.whyHere && <p className="t-small secondary row g8" style={{ alignItems: "flex-start" }}><Icon name="radar" size={16} style={{ marginTop: 2 }} />{m.whyHere}</p>}
          </section>

          {(m.checklist?.length ?? 0) > 0 && (
            <section className="stack g12">
              <h2 className="t-h2">{t("md.steps")}</h2>
              <ol className="stack g8">
                {m.checklist!.map((c, i) => (
                  <li key={c} className="row g12" style={{ alignItems: "flex-start" }}>
                    <span className="t-meta" style={{ width: 20, paddingTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="secondary">{c}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="grid cols-3">
            {[["md.requirements", m.requirements], ["md.safety", m.safety], ["md.equipment", m.equipment]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="inset" style={{ padding: 16 }}>
                <h3 className="t-small" style={{ fontWeight: 500, marginBottom: 6 }}>{t(k)}</h3>
                <p className="t-small secondary">{v}</p>
              </div>
            ))}
          </section>
        </div>

        <aside className="stack g16" style={{ position: "sticky", top: 24 }}>
          <div className="card pad stack g16">
            <div className="stack g8">
              <span className="t-small secondary">{t("md.reward")}</span>
              <div className="row g16">
                <span className="stat-value">+{m.rewardXP} <span style={{ fontSize: 16 }}>XP</span></span>
                <Coins value={`+${m.rewardPoints}`} size={20} className="t-h2" />
              </div>
              <span className="t-small muted">{t("md.rewardNote", { d: t(`diff.${m.difficulty}`) })}</span>
            </div>
            <hr className="hr" />
            {m.source !== "agent" && (
              <div className="row between t-small">
                <span className="secondary">{t("md.spots")}</span>
                <span className="num">{m.participantsCount} / {m.capacity}</span>
              </div>
            )}
            <div className="row between t-small">
              <span className="secondary">{t("md.deadline")}</span>
              <span>{f.date(m.deadline)}</span>
            </div>

            {/* actions */}
            {!me ? (
              <ButtonLink href={`/login?next=/app/missions/${m.id}`} variant="primary" block>{t("md.signInToJoin")}</ButtonLink>
            ) : q.data.canManage ? (
              <ButtonLink href={`/org/missions/${m.id}`} variant="secondary" block icon="settings">{t("md.manage")}</ButtonLink>
            ) : me.role !== "volunteer" ? null : !inApp ? (
              <ButtonLink href={`/app/missions/${m.id}`} variant="primary" block>{t("md.openInApp")}</ButtonLink>
            ) : !joined ? (
              <div className="stack g8">
                {!s?.emailVerified && <Notice tone="warn">{t("md.verifyFirst")} <Link className="link" href="/verify-email">{t("md.verifyLink")}</Link></Notice>}
                <Button variant="primary" size="lg" block disabled={spots === 0 || m.status !== "published"} loading={busy === "join"}
                  onClick={() => act("join", () => api.joinMission(m.id), t("md.joinedToast"))}>
                  {spots === 0 ? t("m.full") : t("md.join")}
                </Button>
              </div>
            ) : sub ? (
              <div className="stack g12">
                <div className="row between"><span className="t-small secondary">{t("md.yourEvidence")}</span><VerificationStatusTag status={sub.verificationStatus} /></div>
                {sub.verificationStatus === "pending" && m.source === "agent" && !sub.aiReview && (
                  <div className="stack g8">
                    <p className="t-small secondary row g8"><span className="spinner" aria-hidden />{t("md.aiChecking")}</p>
                    <Button size="sm" variant="ghost" icon="refresh" loading={busy === "ai"} onClick={() => act("ai", () => api.runAiReview(sub.id))}>{t("md.aiRetry")}</Button>
                  </div>
                )}
                {sub.verificationStatus === "pending" && (m.source !== "agent" || sub.aiReview?.decision === "escalated" || sub.aiReview?.audit === "overturned") && <p className="t-small secondary">{m.source === "agent" ? t("md.pendingAgent") : t("md.pendingOrg")}</p>}
                {sub.aiReview && sub.aiReview.decision !== "escalated" && <AiReviewBox r={sub.aiReview} />}
                {sub.verificationStatus === "approved" && <Notice tone="ok">{t("md.approvedNote")}</Notice>}
                {sub.verificationStatus === "rejected" && <Notice tone="bad">{sub.reviewNote}</Notice>}
              </div>
            ) : !started ? (
              <div className="stack g8">
                <Button variant="primary" size="lg" block icon="route" disabled={!canStart} loading={busy === "start"} onClick={start}>{t("md.start")}</Button>
                <span className="t-small muted">{canStart ? t("md.startHint") : t("md.startsIn", { when: f.relative(m.date) })}</span>
              </div>
            ) : (
              <div className="stack g8">
                <a href="#evidence" className="btn btn-primary btn-lg btn-block"><Icon name="camera" />{t("md.goEvidence")}</a>
                <Button icon="zap" block onClick={() => setSignal(true)}>{t("sg.call")}</Button>
              </div>
            )}

            {inApp && joined && !sub && (
              <div className="row g8">
                <Button size="sm" icon="userPlus" onClick={() => setInvite(true)} className="grow">{t("md.invite")}</Button>
                {m.source === "agent"
                  ? <Button size="sm" variant="ghost" loading={busy === "drop"} onClick={() => act("drop", () => api.dropAgentMission(m.id))}>{t("md.drop")}</Button>
                  : <Button size="sm" variant="ghost" loading={busy === "leave"} onClick={() => act("leave", () => api.leaveMission(m.id), t("md.leftToast"))}>{t("md.leave")}</Button>}
              </div>
            )}
          </div>

          {inApp && joined && (s?.team.length ?? 0) > 0 && (
            <div className="card pad stack g12">
              <h3 className="t-h3">{t("md.team")}</h3>
              {s!.team.map((pp) => (
                <Link key={pp.id} href={`/app/people/${pp.id}`} className="row g12">
                  <Avatar name={pp.fullName} src={pp.avatar} size={32} />
                  <span className="stack"><span style={{ fontSize: 14 }}>{pp.fullName}</span><span className="t-small muted">{t("lvl.short", { n: pp.level })} · {t(levelTitleKey(pp.level))}</span></span>
                </Link>
              ))}
              <span className="t-small muted">{t("md.teamBonus")}</span>
            </div>
          )}
        </aside>
      </div>

      <InviteDialog open={invite} onClose={() => setInvite(false)} missionId={m.id} friends={s?.friends ?? []} />
      {inApp && <SignalDialog open={signal} onClose={() => setSignal(false)} missionId={m.id} presetPlace={m.location} />}
    </div>
  );
}

function InviteDialog({ open, onClose, missionId, friends }: { open: boolean; onClose: () => void; missionId: string; friends: { id: string; fullName: string; avatar: string | null; level: number }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [sent, setSent] = useState<string[]>([]);
  return (
    <Dialog open={open} onClose={onClose} title={t("md.inviteTitle")}>
      {friends.length === 0 ? (
        <Empty icon="users" title={t("md.noFriends")} action={<ButtonLink href="/app/friends" variant="primary">{t("md.findFriends")}</ButtonLink>} />
      ) : (
        <div className="stack g8">
          <p className="t-small secondary" style={{ marginBottom: 8 }}>{t("md.inviteBody")}</p>
          {friends.map((fr) => (
            <div key={fr.id} className="row g12">
              <Avatar name={fr.fullName} src={fr.avatar} size={32} />
              <span className="grow">{fr.fullName}</span>
              <Button size="sm" variant={sent.includes(fr.id) ? "ghost" : "secondary"} disabled={sent.includes(fr.id)} icon={sent.includes(fr.id) ? "check" : "send"}
                onClick={async () => {
                  try { await api.inviteToMission(fr.id, missionId); setSent((x) => [...x, fr.id]); toast(t("md.inviteSent")); } catch (e) { toast(errText(e), "error"); }
                }}>
                {sent.includes(fr.id) ? t("md.sent") : t("md.send")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
