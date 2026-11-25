"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GroupDialog, GroupInviteDialog, GroupMark, InviteCard, JoinRequestBox, JoinRequests } from "@/components/group-bits";
import { Icon } from "@/components/icons";
import { SignalRow } from "@/components/signals";
import { Avatar, Button, ButtonLink, CategoryTag, Dialog, Empty, Progress, Skeleton, useToast } from "@/components/ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function GroupPage() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const q = useApi(() => api.group(id), [id]);
  const [edit, setEdit] = useState(false);
  const [invite, setInvite] = useState(false);
  const params = useSearchParams();
  useEffect(() => { if (params.get("invite") === "1") { setInvite(true); router.replace(`/app/groups/${id}`); } }, [params, id, router]);
  const [leave, setLeave] = useState(false);
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } };

  if (q.data === undefined) return <Skeleton rows={4} />;
  if (!q.data) return <div className="card"><Empty icon="users" title={t("gr.notFound")} action={<ButtonLink href="/app/groups">{t("gr.title")}</ButtonLink>} /></div>;
  const d = q.data;
  const g = d.group;
  const frac = d.levelNext > d.levelStart ? (d.xp - d.levelStart) / (d.levelNext - d.levelStart) : 0;

  return (
    <div className="stack g24 enter">
      <section className="card group-hero" style={{ ["--gc" as string]: g.color }}>
        <div className="row g16 wrap" style={{ alignItems: "center" }}>
          <GroupMark name={g.name} color={g.color} size={72} />
          <div className="stack g4 grow" style={{ minWidth: 0 }}>
            <span className="t-small secondary">{t("gr.label")}{g.mahalla ? ` · ${g.mahalla}` : ""}{g.district ? `, ${g.district}` : ""}</span>
            <h1 className="t-h1">{g.name}</h1>
            {g.description && <p className="secondary">{g.description}</p>}
          </div>
          <div className="row g8 wrap">
            {d.isMember && d.members.length < 30 && <Button variant="primary" icon="userPlus" onClick={() => setInvite(true)}>{t("gi.inviteFriends")}</Button>}
            {d.isMember && <ButtonLink href={`/app/chat/g_${g.id}`} icon="message">{t("gr.chat")}</ButtonLink>}
            {d.isMember && <ButtonLink href="/app/signals?new=1" icon="zap">{t("sg.call")}</ButtonLink>}
            {d.isOwner && <Button icon="edit" variant="ghost" onClick={() => setEdit(true)}>{t("a.edit")}</Button>}
          </div>
        </div>
        <div className="grid gstats" style={{ marginTop: 20 }}>
          <div className="stack g8">
            <span className="stat-label">{t("gr.level")}</span>
            <span className="stat-value num">{d.level}</span>
            <Progress value={frac} label={t("gr.level")} />
            <span className="t-meta">{f.num(d.xp)} / {f.num(d.levelNext)} XP</span>
          </div>
          <div className="stack g4"><span className="stat-label">{t("gr.monthXp")}</span><span className="stat-value num">{f.num(d.monthXp)} <small className="t-meta">XP</small></span></div>
          <div className="stack g4"><span className="stat-label">{t("gr.membersLabel")}</span><span className="stat-value num">{d.members.length} <small className="t-meta">/ 30</small></span></div>
        </div>
      </section>

      <section className="stack g12">
        <div className="section-title"><h2 className="t-h2">{t("gr.ranks")}</h2><Link href="/app/rating?entity=groups" className="t-small link">{t("nav.rating")}</Link></div>
        <div className="grid cols-4 rank-tiles">
          {d.ranks.map((r) => (
            <Link key={r.scope} href={`/app/rating?entity=groups&scope=${r.scope}`} className="card pad stack g4">
              <span className="t-small secondary">{t(`sc.${r.scope}`)}</span>
              <span className="stat-value num">{r.rank ? `#${r.rank}` : "—"}</span>
              <span className="t-meta">{r.total ? t("rt.of", { n: r.total }) : t("rt.noArea")}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="split-wide">
        <div className="stack g24" style={{ minWidth: 0 }}>
          {d.signals.length > 0 && (
            <section className="stack g12">
              <h2 className="t-h2">{t("sg.open")}</h2>
              <div className="card rows">{d.signals.map((s) => <SignalRow key={s.id} s={s} />)}</div>
            </section>
          )}
          <section className="stack g12">
            <h2 className="t-h2">{t("gr.membersLabel")}</h2>
            <div className="card rows">
              {d.members.map((m, i) => (
                <div key={m.id} className="row-item">
                  <span className="t-meta" style={{ width: 18 }}>{i + 1}</span>
                  <Link href={m.isMe ? "/app/profile" : `/app/people/${m.id}`} className="row g12 grow" style={{ minWidth: 0 }}>
                    <Avatar name={m.fullName} src={m.avatar} size={36} />
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>{m.isMe ? t("a.you") : m.fullName}{m.isOwner && <span className="t-meta"> · {t("gr.owner")}</span>}</span>
                      <span className="t-small secondary">{t("lvl.short", { n: m.level })} · {t("gr.contrib", { xp: f.num(m.groupXp) })}</span>
                    </span>
                  </Link>
                  {d.isOwner && !m.isMe && <Button size="sm" variant="ghost" onClick={() => setRemove({ id: m.id, name: m.fullName })}>{t("gr.remove")}</Button>}
                </div>
              ))}
            </div>
          </section>
          <section className="stack g12">
            <h2 className="t-h2">{t("gr.recent")}</h2>
            {d.recent.length === 0 ? <div className="card"><Empty icon="flag" title={t("gr.noRecent")} body={t("gr.noRecentBody")} /></div> : (
              <div className="card rows">
                {d.recent.map((r) => (
                  <div key={r.id} className="row-item">
                    <CategoryTag category={r.category} />
                    <span className="stack grow" style={{ minWidth: 0 }}><span className="truncate" style={{ fontWeight: 500 }}>{r.title}</span><span className="t-small secondary">{r.name} · {f.relative(r.at)}</span></span>
                    <span className="t-meta">+{r.xp} XP</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="stack g16">
          {!d.isMember && <JoinRequestBox groupId={g.id} />}
          {d.isMember && <JoinRequests groupId={g.id} />}
          {d.code && <InviteCard code={d.code} groupName={g.name} owner={d.isOwner} onNewCode={() => run(() => api.newGroupCode(), t("gr.codeRenewed"))} />}
          {d.isMember && <Button variant="danger" icon="logout" onClick={() => setLeave(true)}>{t("gr.leave")}</Button>}
        </aside>
      </div>

      <GroupInviteDialog open={invite} onClose={() => setInvite(false)} />
      <GroupDialog open={edit} onClose={() => setEdit(false)} initial={{ id: g.id, name: g.name, description: g.description, color: g.color }} />
      <Dialog open={leave} onClose={() => setLeave(false)} title={t("gr.leaveTitle")} footer={<>
        <Button variant="ghost" onClick={() => setLeave(false)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { setLeave(false); await run(() => api.leaveGroup(), t("gr.left")); router.replace("/app/groups"); }}>{t("gr.leave")}</Button>
      </>}><p className="t-small secondary">{d.members.length === 1 ? t("gr.leaveLast") : d.isOwner ? t("gr.leaveOwner") : t("gr.leaveBody")}</p></Dialog>
      <Dialog open={Boolean(remove)} onClose={() => setRemove(null)} title={t("gr.removeTitle", { name: remove?.name ?? "" })} footer={<>
        <Button variant="ghost" onClick={() => setRemove(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={() => { const x = remove!; setRemove(null); void run(() => api.removeGroupMember(x.id), t("gr.removed")); }}>{t("gr.remove")}</Button>
      </>}><p className="t-small secondary">{t("gr.removeBody")}</p></Dialog>
    </div>
  );
}
