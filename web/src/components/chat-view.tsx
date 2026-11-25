"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, REACTIONS } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { useRouter } from "next/navigation";
import { celebrate } from "@/lib/fx";
import type { Message } from "@/lib/domain/types";
import { GroupMark, GroupSpot, JoinRequests } from "./group-bits";
import { Icon } from "./icons";
import { Avatar, Button, ButtonLink, CategoryTag, Dialog, Empty, Skeleton, useToast } from "./ui";

type Mode = { kind: "reply" | "edit"; id: string; text: string; from: string } | null;
type ChatKind = "direct" | "group";

/**
 * Two-pane chat. `kind` picks the list: personal chats (friends and the WORFIX team) or group chats.
 * `openId` is a user id or "g_<groupId>".
 */
export function ChatView({ openId, base = "/app/chat", kind = "direct", onPickKind }: { openId: string | null; base?: string; kind?: ChatKind; onPickKind?: (k: ChatKind) => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const direct = useApi(() => api.chats());
  const groups = useApi(() => (base === "/app/chat" ? api.groupChats() : Promise.resolve([])), [base]);
  useEffect(() => {
    if (!openId) return;
    document.body.dataset.chatOpen = "true";
    return () => { delete document.body.dataset.chatOpen; };
  }, [openId]);
  const unreadDirect = (direct.data ?? []).reduce((a, c) => a + c.unread, 0);
  const unreadGroups = (groups.data ?? []).reduce((a, c) => a + c.unread, 0);

  return (
    <div className="card chat" data-open={Boolean(openId)}>
      <div className="chat-list">
        <div className="row between g8" style={{ padding: "14px 16px 8px" }}>
          <h2 className="t-h3">{kind === "group" ? t("chat.groups") : t("chat.title")}</h2>
          {onPickKind && (
            <div className="seg-mini" role="tablist" aria-label={t("chat.title")}>
              <button type="button" role="tab" aria-selected={kind === "direct"} onClick={() => onPickKind("direct")}>{t("chat.personal")}{unreadDirect ? <span className="count-badge">{unreadDirect}</span> : null}</button>
              <button type="button" role="tab" aria-selected={kind === "group"} onClick={() => onPickKind("group")}>{t("chat.groupsShort")}{unreadGroups ? <span className="count-badge">{unreadGroups}</span> : null}</button>
            </div>
          )}
        </div>
        {kind === "group" ? (
          !groups.data ? <div style={{ padding: 16 }}><Skeleton rows={2} height={48} /></div> : groups.data.length === 0 ? (
            <div className="stack g12" style={{ padding: "4px 12px 16px" }}>
              <p className="t-small secondary" style={{ padding: "0 4px" }}>{t("chat.noGroupBody")}</p>
              <GroupSpot compact />
            </div>
          ) : (
            <ul>
              {groups.data.map((c) => {
                const id = `g_${c.group.id}`;
                return (
                  <li key={id}>
                    <Link href={`${base}/${id}`} className="row g12 chat-row" aria-current={openId === id ? "page" : undefined}>
                      <GroupMark name={c.group.name} color={c.group.color} size={40} />
                      <span className="stack grow" style={{ minWidth: 0 }}>
                        <span className="row between g8"><span className="truncate" style={{ fontWeight: c.unread ? 600 : 500, fontSize: 14 }}>{c.group.name}</span>{c.last && <span className="t-meta">{f.relative(c.last.createdAt)}</span>}</span>
                        <span className="row between g8">
                          <span className="t-small secondary truncate">{c.last ? previewOf(c.last, t, c.lastFrom) : t("chat.startHint")}</span>
                          {c.unread > 0 && <span className="count-badge">{c.unread}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              <li style={{ padding: "8px 12px" }}><GroupSpot compact /></li>
            </ul>
          )
        ) : !direct.data ? <div style={{ padding: 16 }}><Skeleton rows={4} height={48} /></div> : direct.data.length === 0 ? (
          <Empty icon="message" title={t("chat.noFriends")} action={base === "/app/chat" ? <ButtonLink href="/app/chat?find=1" size="sm">{t("fr.find")}</ButtonLink> : undefined} />
        ) : (
          <ul>
            {direct.data.map((c) => (
              <li key={c.person.id}>
                <Link href={`${base}/${c.person.id}`} className="row g12 chat-row" aria-current={openId === c.person.id ? "page" : undefined}>
                  <Avatar name={c.person.fullName} src={c.person.avatar} size={40} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="row between g8">
                      <span className="truncate row g4" style={{ fontWeight: c.unread ? 600 : 500, fontSize: 14 }}>{c.person.fullName}{c.isTeam && <Icon name="shield" size={12} className="accent-text" />}</span>
                      {c.last && <span className="t-meta">{f.relative(c.last.createdAt)}</span>}
                    </span>
                    <span className="row between g8">
                      <span className="t-small secondary truncate">{c.last ? previewOf(c.last, t) : t("chat.startHint")}</span>
                      {c.unread > 0 && <span className="count-badge">{c.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="chat-pane">
        {openId ? <Thread id={openId} base={base} /> : <div style={{ margin: "auto" }}><Empty icon="message" title={t("chat.pick")} body={t("chat.pickBody")} /></div>}
      </div>
    </div>
  );
}

function previewOf(m: { kind: string; text: string; deletedAt?: string | null }, t: (k: string, v?: Record<string, string | number>) => string, from = "") {
  if (m.deletedAt) return t("chat.deleted");
  if (m.kind === "invite") return t("chat.inviteShort", { title: m.text });
  if (m.kind === "group_invite") return t("gi.preview", { group: m.text });
  if (m.kind === "signal") return `${t("sg.short")}: ${m.text}`;
  if (m.kind === "system") return systemText(m.text, t);
  return from ? `${from}: ${m.text}` : m.text;
}

function systemText(raw: string, t: (k: string, v?: Record<string, string | number>) => string) {
  try { const x = JSON.parse(raw) as { key: string; values: Record<string, string> }; return t(x.key, x.values); } catch { return raw; }
}

function Thread({ id, base }: { id: string; base: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.thread(id), [id]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pick, setPick] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const count = q.data?.messages.length ?? 0;

  useEffect(() => { void api.markChatRead(id); }, [id, count]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [count, id]);
  useEffect(() => { setSelected(null); setMode(null); setText(""); }, [id]);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  if (q.data === null) return <div style={{ margin: "auto" }}><Empty icon="message" title={t("chat.gone")} action={<ButtonLink href={base} size="sm">{t("a.back")}</ButtonLink>} /></div>;
  if (!q.data) return <div style={{ padding: 20 }}><Skeleton rows={5} height={36} /></div>;
  const d = q.data;
  const group = d.kind === "group";

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      if (mode?.kind === "edit") await api.editMessage(mode.id, text);
      else await api.sendMessage(id, text, mode?.kind === "reply" ? mode.id : null);
      setText("");
      setMode(null);
    } catch (err) { toast(errText(err), "error"); } finally { setSending(false); }
  };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (err) { toast(errText(err), "error"); } };
  const nameOf = (uid: string) => (uid === d.me ? t("chat.you") : (d.names[uid]?.name ?? "—").split(" ")[0]);
  const startMode = (m: Mode) => {
    setMode(m);
    setSelected(null);
    if (m?.kind === "edit") setText(m.text);
    requestAnimationFrame(() => field.current?.focus());
  };
  const jumpTo = (mid: string) => {
    const el = document.getElementById(`msg-${mid}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.dataset.flash = "true";
    setTimeout(() => { delete el.dataset.flash; }, 1200);
  };

  const head = group ? (
    <>
      <GroupMark name={d.title} color={d.color ?? undefined} size={36} />
      <span className="stack" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>{d.title}</span>
        <span className="t-small muted">{t("gr.members", { n: d.group?.members ?? 0 })}</span>
      </span>
    </>
  ) : (
    <>
      <Avatar name={d.title} src={d.avatar} size={36} />
      <span className="stack" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>{d.title}</span>
        <span className="t-small muted">{d.otherIsAdmin ? t("chat.fromTeam") : d.person ? t("lvl.short", { n: d.person.level }) : ""}</span>
      </span>
    </>
  );
  const headHref = group ? `/app/groups/${d.group!.id}` : base === "/app/chat" && !d.otherIsAdmin && d.person ? `/app/people/${d.person.id}` : null;

  let lastDay = "";
  let lastFrom = "";
  return (
    <>
      <div className="row g12" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <Link href={base + (group ? "?tab=groups" : "")} className="btn btn-ghost btn-sm btn-icon chat-back" aria-label={t("a.back")}><Icon name="arrowLeft" size={16} /></Link>
        {headHref ? <Link href={headHref} className="row g12 grow" style={{ minWidth: 0 }}>{head}</Link> : <span className="row g12 grow" style={{ minWidth: 0 }}>{head}</span>}
        {d.groupInvite && d.groupInvite.state !== "member" && (
          <Button size="sm" icon="users" disabled={d.groupInvite.state === "invited"} title={d.groupInvite.groupName}
            onClick={() => act(async () => { await api.inviteToGroup([id]); toast(t("gi.sent", { n: 1 })); })}>
            <span className="hide-sm">{d.groupInvite.state === "invited" ? t("gi.headInvited") : t("gi.headBtn")}</span>
          </Button>
        )}
        {d.isFriend && <Button size="sm" icon="flag" onClick={() => setPick(true)}><span className="hide-sm">{t("chat.inviteBtn")}</span></Button>}
        {group && <ButtonLink size="sm" icon="zap" href="/app/signals?new=1">{t("sg.call")}</ButtonLink>}
      </div>
      {group && <div className="chat-requests"><JoinRequests groupId={d.group!.id} compact /></div>}
      <div ref={scroller} className="chat-scroll">
        {d.messages.length === 0 && <p className="t-small muted" style={{ margin: "auto", textAlign: "center" }}>{t("chat.empty")}</p>}
        {d.messages.map((m) => {
          const mine = m.from === d.me;
          const day = f.date(m.createdAt);
          const sep = day !== lastDay;
          lastDay = day;
          const showName = group && !mine && m.kind !== "system" && (sep || lastFrom !== m.from);
          lastFrom = m.kind === "system" ? "" : m.from;
          if (m.kind === "system") {
            return (
              <div key={m.id} id={`msg-${m.id}`} className="msg stack" style={{ alignItems: "center" }}>
                {sep && <span className="t-meta" style={{ margin: "12px 0 6px" }}>{day}</span>}
                <span className="t-small muted chat-system">{systemText(m.text, t)}</span>
              </div>
            );
          }
          return (
            <div key={m.id} id={`msg-${m.id}`} className="msg stack" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              {sep && <span className="t-meta" style={{ alignSelf: "center", margin: "12px 0 6px" }}>{day}</span>}
              {showName && <span className="t-meta msg-name">{d.names[m.from]?.name ?? "—"}</span>}
              {m.kind === "signal" && m.signal ? (
                <Link href={`/app/signals/${m.signal.id}`} className="card pad stack g8 signal-card" style={{ maxWidth: 360, width: "100%" }}>
                  <span className="row g8 t-small" style={{ fontWeight: 600 }}><Icon name="zap" size={16} />{t("sg.title")}</span>
                  <span style={{ fontWeight: 500 }}>{m.signal.title}</span>
                  <span className="t-small secondary">{m.signal.place}</span>
                  <span className="row g8 t-small secondary">{t("sg.going", { n: m.signal.responders })}{m.signal.going ? ` · ${t("sg.youGo")}` : ""}</span>
                  <span className="bubble-time">{f.time(m.createdAt)}</span>
                </Link>
              ) : m.kind === "group_invite" && "group" in m && m.group ? (
                <GroupInviteBubble m={m as InviteMsg} mine={mine} fromName={d.names[m.from]?.name ?? "—"} />
              ) : m.kind === "invite" && m.mission ? (
                <div className="card pad stack g8" style={{ maxWidth: 360, width: "100%" }}>
                  <span className="t-small secondary row g8"><Icon name="hands" size={16} />{mine ? t("chat.youInvited") : t("chat.invitedYou")}</span>
                  <Link href={`/app/missions/${m.mission.id}`} style={{ fontWeight: 500 }}>{m.mission.title}</Link>
                  <span className="row g12 t-small secondary"><CategoryTag category={m.mission.category} />{f.dayTime(m.mission.date)}</span>
                  {!mine && (m.joined
                    ? <span className="status s-ok">{t("chat.joined")}</span>
                    : m.mission.status === "published"
                      ? <Button size="sm" variant="primary" onClick={async () => { try { await api.acceptInvite(m.id); toast(t("chat.joinedToast")); } catch (e) { toast(errText(e), "error"); } }}>{t("chat.joinTogether")}</Button>
                      : <span className="t-small muted">{t("chat.closed")}</span>)}
                  <span className="bubble-time">{f.time(m.createdAt)}</span>
                </div>
              ) : m.deletedAt ? (
                <div className={`bubble bubble-deleted ${mine ? "bubble-me" : "bubble-them"}`}>
                  <span className="row g8"><Icon name="trash" size={14} />{t("chat.deleted")}</span>
                  <div className="bubble-time" style={{ textAlign: "right" }}>{f.time(m.createdAt)}</div>
                </div>
              ) : (
                <>
                  <button type="button" className={`bubble ${mine ? "bubble-me" : "bubble-them"}`} data-selected={selected === m.id || undefined}
                    aria-haspopup="menu" aria-expanded={selected === m.id} onClick={() => setSelected((x) => (x === m.id ? null : m.id))}>
                    {"via" in m && m.via === "admin" && !mine && <span className="bubble-admin"><Icon name="shield" size={12} />{t("chat.fromTeam")}</span>}
                    {m.replyTo && (
                      <span className="bubble-quote" role="link" tabIndex={-1} onClick={(e) => { e.stopPropagation(); jumpTo(m.replyTo!.id); }}>
                        <span className="bubble-quote-name">{nameOf(m.replyTo.from)}</span>
                        <span className="truncate">{m.replyTo.text || t("chat.deleted")}</span>
                      </span>
                    )}
                    <span className="bubble-text">{m.text}</span>
                    <span className="bubble-time" style={{ textAlign: "right" }}>
                      {m.editedAt ? `${t("chat.edited")} · ` : ""}{f.time(m.createdAt)}{mine && m.readBy.length > 1 ? ` · ${group ? t("chat.readN", { n: m.readBy.length - 1 }) : t("chat.read")}` : ""}
                    </span>
                  </button>
                  {Object.keys(m.reactions ?? {}).length > 0 && (
                    <span className="reactions">
                      {Object.entries(m.reactions ?? {}).map(([e, ids]) => (
                        <button key={e} type="button" className="reaction" data-mine={ids.includes(d.me) || undefined} onClick={() => act(() => api.reactToMessage(m.id, e))}
                          aria-label={t("chat.reactionLabel", { e, n: ids.length })} title={ids.map((x) => nameOf(x)).join(", ")}>
                          {e}{ids.length > 1 && <span className="num">{ids.length}</span>}
                        </button>
                      ))}
                    </span>
                  )}
                  {selected === m.id && (
                    <div className="msg-actions" role="menu" data-mine={mine || undefined}>
                      <div className="msg-reacts">
                        {REACTIONS.map((e) => (
                          <button key={e} type="button" role="menuitem" data-on={(m.reactions?.[e] ?? []).includes(d.me) || undefined}
                            onClick={() => { setSelected(null); void act(() => api.reactToMessage(m.id, e)); }} aria-label={t("chat.react", { e })}>{e}</button>
                        ))}
                      </div>
                      <div className="msg-cmds">
                        {d.canWrite && <button type="button" role="menuitem" onClick={() => startMode({ kind: "reply", id: m.id, text: m.text, from: m.from })}><Icon name="arrowLeft" size={16} />{t("chat.reply")}</button>}
                        <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(m.text); setSelected(null); toast(t("chat.copied")); }}><Icon name="copy" size={16} />{t("chat.copy")}</button>
                        {mine && m.kind === "text" && <button type="button" role="menuitem" onClick={() => startMode({ kind: "edit", id: m.id, text: m.text, from: m.from })}><Icon name="edit" size={16} />{t("chat.edit")}</button>}
                        {mine && <button type="button" role="menuitem" className="danger" onClick={() => { setSelected(null); setConfirmDel(m.id); }}><Icon name="trash" size={16} />{t("chat.delete")}</button>}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {d.canWrite ? (
        <div className="composer-wrap">
          {mode && (
            <div className="composer-mode">
              <Icon name={mode.kind === "edit" ? "edit" : "arrowLeft"} size={16} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="t-small" style={{ fontWeight: 500 }}>{mode.kind === "edit" ? t("chat.editing") : t("chat.replyingTo", { name: nameOf(mode.from) })}</span>
                <span className="t-small secondary truncate">{mode.text}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => { setMode(null); if (mode.kind === "edit") setText(""); }} aria-label={t("a.cancel")}><Icon name="x" size={16} /></button>
            </div>
          )}
          <form className="composer" onSubmit={send}>
            <textarea ref={field} className="input composer-input" rows={1} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); void send(); } }}
              placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} maxLength={1000} />
            <Button type="submit" variant="primary" iconOnly icon={mode?.kind === "edit" ? "check" : "send"} loading={sending} aria-label={mode?.kind === "edit" ? t("a.save") : t("chat.send")} disabled={!text.trim()} />
          </form>
        </div>
      ) : <p className="t-small muted" style={{ padding: 16, borderTop: "1px solid var(--line)" }}>{t("chat.notFriend")}</p>}

      <Dialog open={Boolean(confirmDel)} onClose={() => setConfirmDel(null)} title={t("chat.deleteTitle")} footer={<>
        <Button variant="ghost" onClick={() => setConfirmDel(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={() => { const mid = confirmDel!; setConfirmDel(null); if (mode?.id === mid) { setMode(null); setText(""); } void act(() => api.deleteMessage(mid)); }}>{t("chat.delete")}</Button>
      </>}>
        <p className="t-small secondary">{t("chat.deleteBody")}</p>
      </Dialog>

      <Dialog open={pick} onClose={() => setPick(false)} title={t("chat.inviteTitle")}>
        {d.myActive.length === 0 ? <Empty icon="flag" title={t("chat.noActive")} action={<ButtonLink href="/app/map?view=list&tab=explore" variant="primary">{t("nav.explore")}</ButtonLink>} /> : (
          <div className="stack g8">
            <p className="t-small secondary" style={{ marginBottom: 8 }}>{t("md.inviteBody")}</p>
            {d.myActive.map((m) => (
              <button key={m.id} type="button" className="radio-card" style={{ textAlign: "left" }} onClick={async () => {
                try { await api.inviteToMission(id, m.id); toast(t("md.inviteSent")); setPick(false); } catch (e) { toast(errText(e), "error"); }
              }}>
                <Icon name="flag" />
                <span className="stack"><span style={{ fontWeight: 500 }}>{m.title}</span><span className="t-small secondary">{f.dayTime(m.date)}</span></span>
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}

type InviteMsg = Message & { invite: { exists: boolean; members: number; full: boolean; description: string; isMember: boolean; otherGroup: string | null } | null };

/** A group invite inside a personal chat: the friend joins, switches group or declines right here. */
function GroupInviteBubble({ m, mine, fromName }: { m: InviteMsg; mine: boolean; fromName: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const g = m.group!;
  const info = m.invite;
  const answer = async (decision: "accepted" | "declined", switchGroup = false) => {
    setBusy(decision === "accepted" ? "join" : "decline");
    try {
      await api.respondGroupInvite(m.id, decision, { switchGroup });
      if (decision === "accepted") { celebrate(card.current); toast(t("gi.joinedToast", { group: g.name })); }
      else toast(t("gi.declinedToast"));
    } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  const status = m.inviteStatus;
  let footer: React.ReactNode;
  if (mine) {
    footer = <span className={`status ${status === "accepted" ? "s-ok" : status === "declined" ? "s-neutral" : "s-warn"}`}>{status === "accepted" ? t("gi.card.theyJoined") : status === "declined" ? t("gi.card.declined") : t("gi.card.waiting")}</span>;
  } else if (!info?.exists) footer = <span className="t-small muted">{t("gi.card.gone")}</span>;
  else if (info.isMember) footer = <Button size="sm" variant="primary" icon="users" onClick={() => router.push(`/app/groups/${g.id}`)}>{t("gi.card.open")}</Button>;
  else if (status === "declined") footer = <span className="status s-neutral">{t("gi.card.declined")}</span>;
  else if (info.full) footer = <span className="t-small muted">{t("gi.card.full")}</span>;
  else if (info.otherGroup) footer = (
    <div className="stack g8">
      <span className="t-small secondary">{t("gi.card.switchHint", { group: info.otherGroup })}</span>
      <div className="row g8">
        <Button size="sm" variant="primary" loading={busy === "join"} onClick={() => setConfirmSwitch(true)}>{t("gi.card.switch")}</Button>
        <Button size="sm" variant="ghost" loading={busy === "decline"} onClick={() => answer("declined")}>{t("gi.card.decline")}</Button>
      </div>
    </div>
  );
  else footer = (
    <div className="row g8">
      <Button size="sm" variant="primary" icon="check" loading={busy === "join"} onClick={() => answer("accepted")} className="grow">{t("gi.card.join")}</Button>
      <Button size="sm" variant="ghost" loading={busy === "decline"} onClick={() => answer("declined")}>{t("gi.card.decline")}</Button>
    </div>
  );
  return (
    <div ref={card} className="invite-bubble" style={{ ["--gc" as string]: g.color }} data-mine={mine || undefined}>
      <span className="invite-bubble-band" aria-hidden />
      <span className="t-small secondary row g8"><Icon name="users" size={14} />{mine ? t("gi.card.youInvited") : `${fromName.split(" ")[0]} · ${t("gi.card.invitedYou")}`}</span>
      <div className="row g12" style={{ alignItems: "center" }}>
        <GroupMark name={g.name} color={g.color} size={52} />
        <span className="stack" style={{ minWidth: 0 }}>
          <strong className="truncate invite-bubble-name">{g.name}</strong>
          <span className="t-small secondary">{t("gi.card.members", { n: info?.members ?? 0 })}</span>
        </span>
      </div>
      {info?.description && <p className="t-small secondary invite-bubble-desc">{info.description}</p>}
      {footer}
      <span className="bubble-time">{f.time(m.createdAt)}</span>
      <Dialog open={confirmSwitch} onClose={() => setConfirmSwitch(false)} title={t("gi.card.switch")} footer={<>
        <Button variant="ghost" onClick={() => setConfirmSwitch(false)}>{t("a.cancel")}</Button>
        <Button variant="primary" onClick={() => { setConfirmSwitch(false); void answer("accepted", true); }}>{t("gi.card.join")}</Button>
      </>}><p className="t-small secondary">{t("gi.card.switchHint", { group: info?.otherGroup ?? "" })}</p></Dialog>
    </div>
  );
}
