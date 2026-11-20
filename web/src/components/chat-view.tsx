"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, REACTIONS } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { Avatar, Button, ButtonLink, CategoryTag, Dialog, Empty, Skeleton, useToast } from "./ui";

type Mode = { kind: "reply" | "edit"; id: string; text: string; from: string } | null;

export function ChatView({ friendId, base = "/app/chat" }: { friendId: string | null; base?: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const list = useApi(() => api.chats());
  useEffect(() => {
    if (!friendId) return;
    document.body.dataset.chatOpen = "true";
    return () => { delete document.body.dataset.chatOpen; };
  }, [friendId]);

  return (
    <div className="card chat" data-open={Boolean(friendId)}>
      <div className="chat-list">
        <div style={{ padding: "16px 16px 8px" }}><h2 className="t-h3">{t("chat.title")}</h2></div>
        {!list.data ? <div style={{ padding: 16 }}><Skeleton rows={4} height={48} /></div> : list.data.length === 0 ? (
          <Empty icon="message" title={t("chat.noFriends")} action={<ButtonLink href="/app/friends" size="sm">{t("fr.find")}</ButtonLink>} />
        ) : (
          <ul>
            {list.data.map((c) => (
              <li key={c.person.id}>
                <Link href={`${base}/${c.person.id}`} className="row g12" aria-current={friendId === c.person.id ? "page" : undefined}
                  style={{ padding: "10px 16px", background: friendId === c.person.id ? "var(--raised)" : undefined }}>
                  <Avatar name={c.person.fullName} src={c.person.avatar} size={40} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="row between g8"><span className="truncate" style={{ fontWeight: c.unread ? 600 : 500, fontSize: 14 }}>{c.person.fullName}</span>{c.last && <span className="t-meta">{f.relative(c.last.createdAt)}</span>}</span>
                    <span className="row between g8">
                      <span className="t-small secondary truncate">{c.last ? (c.last.deletedAt ? t("chat.deleted") : c.last.kind === "invite" ? t("chat.inviteShort", { title: c.last.text }) : c.last.text) : t("chat.startHint")}</span>
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
        {friendId ? <Thread friendId={friendId} base={base} /> : <div style={{ margin: "auto" }}><Empty icon="message" title={t("chat.pick")} body={t("chat.pickBody")} /></div>}
      </div>
    </div>
  );
}

function Thread({ friendId, base }: { friendId: string; base: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.thread(friendId), [friendId]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pick, setPick] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const count = q.data?.messages.length ?? 0;

  useEffect(() => { void api.markChatRead(friendId); }, [friendId, count]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [count, friendId]);
  useEffect(() => { setSelected(null); setMode(null); setText(""); }, [friendId]);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  if (!q.data) return <div style={{ padding: 20 }}><Skeleton rows={5} height={36} /></div>;
  const d = q.data;

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      if (mode?.kind === "edit") await api.editMessage(mode.id, text);
      else await api.sendMessage(friendId, text, mode?.kind === "reply" ? mode.id : null);
      setText("");
      setMode(null);
    } catch (err) { toast(errText(err), "error"); } finally { setSending(false); }
  };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (err) { toast(errText(err), "error"); } };
  const nameOf = (id: string) => (id === d.me ? t("chat.you") : d.person.fullName.split(" ")[0]);
  const startMode = (m: Mode) => {
    setMode(m);
    setSelected(null);
    if (m?.kind === "edit") setText(m.text);
    requestAnimationFrame(() => field.current?.focus());
  };
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.dataset.flash = "true";
    setTimeout(() => { delete el.dataset.flash; }, 1200);
  };

  let lastDay = "";
  return (
    <>
      <div className="row g12" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <Link href={base} className="btn btn-ghost btn-sm btn-icon chat-back" aria-label={t("a.back")}><Icon name="arrowLeft" size={16} /></Link>
        {(() => {
          const head = (
            <>
              <Avatar name={d.person.fullName} src={d.person.avatar} size={36} />
              <span className="stack" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 500 }}>{d.person.fullName}</span>
                <span className="t-small muted">{d.otherIsAdmin ? t("chat.fromTeam") : t("lvl.short", { n: d.person.level })}</span>
              </span>
            </>
          );
          return base === "/app/chat" && !d.otherIsAdmin
            ? <Link href={`/app/people/${d.person.id}`} className="row g12 grow" style={{ minWidth: 0 }}>{head}</Link>
            : <span className="row g12 grow" style={{ minWidth: 0 }}>{head}</span>;
        })()}
        {d.isFriend && <Button size="sm" icon="flag" onClick={() => setPick(true)}>{t("chat.inviteBtn")}</Button>}
      </div>
      <div ref={scroller} className="chat-scroll">
        {d.messages.length === 0 && <p className="t-small muted" style={{ margin: "auto", textAlign: "center" }}>{t("chat.empty")}</p>}
        {d.messages.map((m) => {
          const mine = m.from === d.me;
          const day = f.date(m.createdAt);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id} id={`msg-${m.id}`} className="msg stack" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              {sep && <span className="t-meta" style={{ alignSelf: "center", margin: "12px 0 6px" }}>{day}</span>}
              {m.kind === "invite" && m.mission ? (
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
                    {m.via === "admin" && !mine && <span className="bubble-admin"><Icon name="shield" size={12} />{t("chat.fromTeam")}</span>}
                    {m.replyTo && (
                      <span className="bubble-quote" role="link" tabIndex={-1} onClick={(e) => { e.stopPropagation(); jumpTo(m.replyTo!.id); }}>
                        <span className="bubble-quote-name">{nameOf(m.replyTo.from)}</span>
                        <span className="truncate">{m.replyTo.text || t("chat.deleted")}</span>
                      </span>
                    )}
                    <span className="bubble-text">{m.text}</span>
                    <span className="bubble-time" style={{ textAlign: "right" }}>
                      {m.editedAt ? `${t("chat.edited")} · ` : ""}{f.time(m.createdAt)}{mine && m.readBy.length > 1 ? ` · ${t("chat.read")}` : ""}
                    </span>
                  </button>
                  {Object.keys(m.reactions ?? {}).length > 0 && (
                    <span className="reactions">
                      {Object.entries(m.reactions ?? {}).map(([e, ids]) => (
                        <button key={e} type="button" className="reaction" data-mine={ids.includes(d.me) || undefined} onClick={() => act(() => api.reactToMessage(m.id, e))}
                          aria-label={t("chat.reactionLabel", { e, n: ids.length })}>
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
                        {mine && <button type="button" role="menuitem" onClick={() => startMode({ kind: "edit", id: m.id, text: m.text, from: m.from })}><Icon name="edit" size={16} />{t("chat.edit")}</button>}
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
        <Button variant="danger" onClick={() => { const id = confirmDel!; setConfirmDel(null); if (mode?.id === id) { setMode(null); setText(""); } void act(() => api.deleteMessage(id)); }}>{t("chat.delete")}</Button>
      </>}>
        <p className="t-small secondary">{t("chat.deleteBody")}</p>
      </Dialog>

      <Dialog open={pick} onClose={() => setPick(false)} title={t("chat.inviteTitle")}>
        {d.myActive.length === 0 ? <Empty icon="flag" title={t("chat.noActive")} action={<ButtonLink href="/app/explore" variant="primary">{t("nav.explore")}</ButtonLink>} /> : (
          <div className="stack g8">
            <p className="t-small secondary" style={{ marginBottom: 8 }}>{t("md.inviteBody")}</p>
            {d.myActive.map((m) => (
              <button key={m.id} type="button" className="radio-card" style={{ textAlign: "left" }} onClick={async () => {
                try { await api.inviteToMission(friendId, m.id); toast(t("md.inviteSent")); setPick(false); } catch (e) { toast(errText(e), "error"); }
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
