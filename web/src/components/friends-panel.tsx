"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { PersonRow } from "./person-row";
import { Avatar, Button, ButtonLink, CategoryTag, Empty, Skeleton, Tabs, useToast } from "./ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

type Tab = "friends" | "requests" | "find" | "activity";

export function FriendsPanel() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const [tab, setTab] = useState<Tab>("friends");
  const [q, setQ] = useState("");
  const ov = useApi(() => api.friendsOverview());
  const people = useApi(() => (tab === "find" ? api.people(q) : Promise.resolve([])), [tab, q]);
  const feed = useApi(() => (tab === "activity" ? api.feed({ scope: "all" }) : Promise.resolve([])), [tab]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } };

  return (
    <div className="stack g24 enter">
      <Tabs value={tab} onChange={setTab} items={[
        { value: "friends", label: t("fr.friends"), count: ov.data?.friends.length },
        { value: "requests", label: t("fr.requests"), count: ov.data?.incoming.length },
        { value: "find", label: t("fr.find") },
        { value: "activity", label: t("fr.activity") },
      ]} />

      {tab === "friends" && (!ov.data ? <Skeleton rows={4} /> : (
        <div className="split-wide">
          <div className="card rows">
            {ov.data.friends.length === 0 ? <Empty icon="users" title={t("fr.none")} action={<Button variant="primary" onClick={() => setTab("find")}>{t("fr.find")}</Button>} /> :
              ov.data.friends.map((p) => (
                <PersonRow key={p.id} p={p} actions={<>
                  <ButtonLink href={`/app/chat/${p.id}`} size="sm" icon="message" aria-label={t("fr.message")}>{t("fr.message")}</ButtonLink>
                </>} />
              ))}
          </div>
          <section className="card pad stack g12">
            <h2 className="t-h3">{t("home.app.board")}</h2>
            <ol className="stack g8">
              {ov.data.leaderboard.map((p, i) => (
                <li key={p.id} className="row g12">
                  <span className="t-meta" style={{ width: 16 }}>{i + 1}</span>
                  <Avatar name={p.fullName} src={p.avatar} size={28} />
                  <span className="grow truncate" style={{ fontSize: 14, fontWeight: p.isMe ? 500 : 400 }}>{p.isMe ? t("a.you") : p.fullName}</span>
                  <span className="t-meta">{f.num(p.xp)} XP</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ))}

      {tab === "requests" && (!ov.data ? <Skeleton rows={2} /> : (
        <div className="stack g16">
          <div className="card rows">
            {ov.data.incoming.length === 0 ? <Empty icon="userPlus" title={t("fr.noRequests")} /> : ov.data.incoming.map((r) => (
              <PersonRow key={r.friendshipId} p={r.person} actions={<>
                <Button size="sm" variant="primary" onClick={() => run(() => api.respondFriendRequest(r.friendshipId, true), t("fr.accepted"))}>{t("fr.accept")}</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api.respondFriendRequest(r.friendshipId, false))}>{t("fr.decline")}</Button>
              </>} />
            ))}
          </div>
          {ov.data.outgoing.length > 0 && (
            <section className="stack g8">
              <h2 className="t-h3">{t("fr.sent")}</h2>
              <div className="card rows">
                {ov.data.outgoing.map((r) => (
                  <PersonRow key={r.friendshipId} p={r.person} actions={<Button size="sm" variant="ghost" onClick={() => run(() => api.removeFriend(r.person.id))}>{t("fr.cancel")}</Button>} />
                ))}
              </div>
            </section>
          )}
        </div>
      ))}

      {tab === "find" && (
        <div className="stack g16">
          <div className="input-wrap" style={{ maxWidth: 420 }}>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fr.searchPh")} aria-label={t("fr.searchPh")} style={{ paddingLeft: 36, paddingRight: 12 }} />
            <span style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }}><Icon name="search" size={18} /></span>
          </div>
          <div className="card rows">
            {!people.data ? <Skeleton rows={3} /> : people.data.length === 0 ? <Empty icon="search" title={t("fr.noPeople")} /> : people.data.map((p) => (
              <PersonRow key={p.id} p={p} sub={p.nearby ? <>{t("fr.nearby")} · {t("lvl.short", { n: p.level })}</> : undefined} actions={
                p.relation === "friend" ? <ButtonLink href={`/app/chat/${p.id}`} size="sm" icon="message">{t("fr.message")}</ButtonLink>
                  : p.relation === "outgoing" ? <span className="t-small muted">{t("fr.pending")}</span>
                  : <Button size="sm" variant={p.relation === "incoming" ? "primary" : "secondary"} icon="userPlus" onClick={() => run(() => api.sendFriendRequest(p.id), t("fr.requestSent"))}>
                      {p.relation === "incoming" ? t("fr.accept") : t("fr.add")}
                    </Button>
              } />
            ))}
          </div>
        </div>
      )}

      {tab === "activity" && (
        !feed.data ? <Skeleton rows={3} height={140} /> : feed.data.length === 0 ? <div className="card"><Empty icon="heart" title={t("fr.noActivity")} /></div> : (
          <div className="stack g12" style={{ maxWidth: 720 }}>
            {feed.data.map((i) => (
              <article key={i.id} className="card pad stack g12">
                <div className="row g12">
                  <Link href={i.isMe ? "/app/profile" : `/app/people/${i.author.id}`}><Avatar name={i.author.fullName} src={i.author.avatar} size={36} /></Link>
                  <div className="stack grow" style={{ minWidth: 0 }}>
                    <span className="truncate"><Link href={i.isMe ? "/app/profile" : `/app/people/${i.author.id}`} style={{ fontWeight: 500 }}>{i.isMe ? t("a.you") : i.author.fullName}</Link> <span className="secondary">{t("fr.completed")}</span></span>
                    <span className="t-small muted">{f.relative(i.at)}</span>
                  </div>
                  <CategoryTag category={i.mission.category} />
                </div>
                <Link href={`/app/missions/${i.mission.id}`} style={{ fontWeight: 500 }}>{i.mission.title}</Link>
                {i.notes && <p className="secondary t-small">{i.notes}</p>}
                {i.photos.length > 0 && <div className="thumbs">{i.photos.slice(0, 4).map((p, k) => <div key={k} className="thumb"><img src={p} alt="" /></div>)}</div>}
                <div className="row g12">
                  <Button size="sm" variant={i.cheered ? "secondary" : "ghost"} icon="heart" disabled={i.isMe} aria-pressed={i.cheered} onClick={() => run(() => api.toggleCheer(i.id))}>
                    <span className="num">{i.cheers}</span>
                  </Button>
                  {i.team && <span className="t-small muted row g4"><Icon name="hands" size={14} />{t("fr.teamDone")}</span>}
                </div>
              </article>
            ))}
          </div>
        )
      )}
    </div>
  );
}
