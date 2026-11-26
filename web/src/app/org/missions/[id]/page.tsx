"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/shell";
import { Avatar, Button, ButtonLink, CategoryTag, DifficultyTag, Empty, MISSION_STATUS_TONE, Notice, Skeleton, Status, VerificationStatusTag, useToast } from "@/components/ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { api6 } from "@/lib/store/api6";
import { RateDialog } from "@/components/v6-bits";
import { MissionSkillsEditor } from "@/components/org-v6";

export default function OrgMission() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.getMission(id), [id]);
  const parts = useApi(() => api.missionParticipants(id).catch(() => []), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const toRate = useApi(() => api6.missionRatings(id).catch(() => []), [id]);
  const [rate, setRate] = useState<{ id: string; name: string } | null>(null);
  const run = async (k: string, fn: () => Promise<unknown>, ok?: string) => { setBusy(k); try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); } };

  if (q.loading && !q.data) return <Skeleton rows={4} />;
  if (!q.data) return <div className="card"><Empty icon="flag" title={t("md.notFound")} /></div>;
  const m = q.data.mission;

  return (
    <div className="stack g24 enter">
      <Link href="/org/missions" className="row g8 t-small secondary" style={{ width: "fit-content" }}><Icon name="arrowLeft" size={16} />{t("nav.orgMissions")}</Link>
      <PageHead title={m.title}
        sub={<span className="row g12 wrap"><CategoryTag category={m.category} /><DifficultyTag difficulty={m.difficulty} /><span>{f.dayTime(m.date)}</span><Status tone={MISSION_STATUS_TONE[m.status]}>{t(`ms.${m.status}`)}</Status></span>}
        actions={<>
          {m.status === "draft" && <Button variant="primary" icon="flag" loading={busy === "pub"} onClick={() => run("pub", () => api.publishMission(m.id), t("org.published"))}>{t("org.publish")}</Button>}
          {(m.status === "draft" || m.status === "published") && <ButtonLink href={`/org/missions/${m.id}/edit`} icon="edit">{t("a.edit")}</ButtonLink>}
          {m.status === "published" && <Button loading={busy === "close"} onClick={() => run("close", () => api.closeMission(m.id), t("org.closed"))}>{t("org.close")}</Button>}
          {m.status === "draft" && <Button variant="danger" icon="trash" loading={busy === "del"} onClick={() => run("del", async () => { await api.deleteDraft(m.id); location.assign("/org/missions"); })}>{t("a.delete")}</Button>}
          <ButtonLink href={`/missions/${m.id}`} variant="ghost" icon="external">{t("org.preview")}</ButtonLink>
        </>}
      />
      {m.moderationNote && <Notice tone="bad"><strong>{t("org.moderation")}</strong> {m.moderationNote}</Notice>}

      <section className="stack g12">
        <div className="row between"><h2 className="t-h2">{t("org.participants")}</h2><span className="t-meta">{m.participantsCount} / {m.capacity}</span></div>
        {!parts.data ? <Skeleton rows={3} /> : parts.data.length === 0 ? <div className="card"><Empty icon="users" title={t("org.noParticipants")} /></div> : (
          <div className="card rows">
            {parts.data.map(({ participant: p, volunteer: v, skills, submissionStatus }) => (
              <div key={p.id} className="row-item">
                <Avatar name={v.fullName} src={v.avatar} size={36} />
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ fontWeight: 500 }}>{v.fullName}</span>
                  <span className="t-small secondary truncate">{t("lvl.short", { n: v.level })}{v.city ? ` · ${v.city}` : ""}{skills.length ? ` · ${skills.slice(0, 3).join(", ")}` : ""}{p.teamId ? ` · ${t("org.team")}` : ""}</span>
                </span>
                {submissionStatus ? <VerificationStatusTag status={submissionStatus} /> : p.startedAt ? <Status tone="info">{t("ms.inProgress")}</Status> : <Status tone={p.status === "accepted" ? "ok" : p.status === "rejected" ? "bad" : "neutral"}>{t(`ps.${p.status}`)}</Status>}
                {!submissionStatus && p.status === "accepted" && <Button size="sm" variant="ghost" onClick={() => run(p.id, () => api.decideParticipant(m.id, v.id, "rejected"))}>{t("org.decline")}</Button>}
                {!submissionStatus && p.status === "rejected" && <Button size="sm" onClick={() => run(p.id, () => api.decideParticipant(m.id, v.id, "accepted"))}>{t("org.accept")}</Button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {(toRate.data ?? []).some((x) => x.open && !x.rated) && (
        <section className="card pad stack g12">
          <h2 className="t-h3">{t("rat.rateVolunteers")}</h2>
          <p className="t-small secondary">{t("rat.blind")}</p>
          <div className="row g8 wrap">
            {toRate.data!.filter((x) => x.open && !x.rated).map((x) => (
              <Button key={x.volunteer.id} size="sm" icon="award" onClick={() => setRate({ id: x.volunteer.id, name: x.volunteer.fullName })}>{x.volunteer.fullName}</Button>
            ))}
          </div>
        </section>
      )}
      {rate && <RateDialog open onClose={() => { setRate(null); toRate.reload(); }} kind="org_to_vol" missionId={m.id} toId={rate.id} name={rate.name} />}

      {(m.status === "draft" || m.status === "published") && <MissionSkillsEditor missionId={m.id} initial={m.skillsWanted ?? []} />}

      <section className="grid cols-2">
        <div className="card pad stack g8"><h3 className="t-h3">{t("md.about")}</h3><p className="prose t-small">{m.description}</p></div>
        <div className="card pad stack g8">
          <h3 className="t-h3">{t("mf.verification")}</h3>
          <span className="t-small secondary">{t("md.radius", { m: m.radiusM ?? 400 })}</span>
          <ol className="stack g4 t-small">{(m.checklist ?? []).map((c) => <li key={c}>· {c}</li>)}</ol>
        </div>
      </section>
    </div>
  );
}
