"use client";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GROUP_COLORS } from "@/lib/domain/community";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { useApi as useApiHook } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { Avatar, Button, Dialog, Notice, TextArea, TextInput, useToast } from "./ui";

/** Round group mark: initials on the group colour. */
export function GroupMark({ name, color = GROUP_COLORS[0], size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "G";
  return (
    <span className="group-mark" aria-hidden style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}>{initials}</span>
  );
}

/** Create or edit a group. */
export function GroupDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { id: string; name: string; description: string; color: string } }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [v, setV] = useState({ name: "", description: "", color: GROUP_COLORS[0] as string });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(initial ? { name: initial.name, description: initial.description, color: initial.color } : { name: "", description: "", color: GROUP_COLORS[0] }); setFields({}); setError(null); } }, [open, initial]);
  const save = async () => {
    setBusy(true); setFields({}); setError(null);
    try {
      if (initial) { await api.updateGroup(initial.id, v); toast(t("gr.saved")); onClose(); }
      else { const { id } = await api.createGroup(v); toast(t("gr.created")); onClose(); router.push(`/app/groups/${id}?invite=1`); }
    } catch (e) {
      if (e instanceof ValidationError) setFields(e.fields); else setError(errText(e));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t("gr.edit") : t("gr.create")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy} onClick={save}>{initial ? t("a.save") : t("gr.createBtn")}</Button>
    </>}>
      <div className="stack g16">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="row g12">
          <GroupMark name={v.name || "G"} color={v.color} size={56} />
          <div className="row g8 wrap" role="radiogroup" aria-label={t("gr.color")}>
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setV((s) => ({ ...s, color: c }))}>
                {v.color === c && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
        <TextInput label={t("gr.name")} value={v.name} maxLength={40} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} error={fields.name && t(fields.name)} placeholder={t("gr.namePh")} />
        <TextArea label={t("gr.description")} rows={2} maxLength={200} value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} error={fields.description && t(fields.description)} />
        {!initial && <p className="t-small secondary">{t("gr.areaNote")}</p>}
      </div>
    </Dialog>
  );
}

/** Join with a code (or a pasted invite link). */
export function JoinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); setErr(null);
    try {
      const raw = code.includes("/join/") ? code.split("/join/")[1] : code;
      const { id } = await api.joinGroup(raw);
      toast(t("gr.joined")); onClose(); router.push(`/app/groups/${id}`);
    } catch (e) { setErr(e instanceof ValidationError ? t(Object.values(e.fields)[0]) : errText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("gr.joinTitle")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy} disabled={!code.trim()} onClick={join}>{t("gr.joinBtn")}</Button>
    </>}>
      <div className="stack g12">
        <p className="t-small secondary">{t("gr.joinBody")}</p>
        <TextInput label={t("gr.code")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WFX-AB2CD" autoCapitalize="characters" spellCheck={false} error={err ?? undefined} />
      </div>
    </Dialog>
  );
}

/** Invite card: QR code with the join link, the code, copy and share. */
export function InviteCard({ code, groupName, owner, onNewCode }: { code: string; groupName: string; owner: boolean; onNewCode: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const link = typeof window === "undefined" ? `/app/join/${code}` : `${window.location.origin}/app/join/${code}`;
  useEffect(() => { void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#1d1a15", light: "#ffffff" } }).then(setQr); }, [link]);
  const share = async () => {
    const text = t("gr.shareText", { name: groupName, code });
    if (navigator.share) { try { await navigator.share({ title: groupName, text, url: link }); return; } catch { /* closed */ } }
    await navigator.clipboard?.writeText(`${text}\n${link}`);
    toast(t("gr.linkCopied"));
  };
  return (
    <div className="card pad stack g12 invite-card">
      <h3 className="t-h3">{t("gi.orShare")}</h3>
      <div className="row g16 wrap" style={{ alignItems: "center" }}>
        {qr ? <img src={qr} alt={t("gr.qrAlt", { code })} width={148} height={148} className="qr" /> : <span className="qr" style={{ width: 148, height: 148 }} />}
        <div className="stack g8" style={{ minWidth: 180 }}>
          <span className="t-small secondary">{t("gr.codeLabel")}</span>
          <span className="group-code num">{code}</span>
          <div className="row g8 wrap">
            <Button size="sm" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(code); toast(t("gr.codeCopied")); }}>{t("gr.copyCode")}</Button>
            <Button size="sm" variant="primary" icon="send" onClick={share}>{t("gr.share")}</Button>
          </div>
          {owner && <button type="button" className="t-small link" style={{ width: "fit-content", background: "none", border: 0, padding: 0 }} onClick={onNewCode}>{t("gr.newCode")}</button>}
        </div>
      </div>
      <p className="t-small muted">{t("gr.inviteHint")}</p>
    </div>
  );
}

type Candidates = NonNullable<Awaited<ReturnType<typeof api.groupInviteCandidates>>>;

/** Pick friends and send each one a group invite in chat. */
export function GroupInviteDialog({ open, onClose, preselect }: { open: boolean; onClose: () => void; preselect?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [data, setData] = useState<Candidates | null | undefined>(undefined);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setQuery(""); setData(undefined);
    void api.groupInviteCandidates().then((d) => {
      setData(d);
      setPicked(new Set(preselect && d?.friends.some((f) => f.person.id === preselect && f.state !== "member" && f.state !== "invited") ? [preselect] : []));
    });
  }, [open, preselect]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    setBusy(true);
    try { const { sent } = await api.inviteToGroup([...picked]); toast(t("gi.sent", { n: sent })); onClose(); }
    catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
  };
  const list = (data?.friends ?? []).filter((f) => !query.trim() || `${f.person.fullName} ${f.person.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  const spots = data ? data.group.max - data.group.members : 0;
  return (
    <Dialog open={open} onClose={onClose} title={data ? t("gi.title", { group: data.group.name }) : t("gi.inviteFriends")} footer={data && data.friends.length > 0 ? <>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" icon="send" loading={busy} disabled={!picked.size} onClick={send}>{picked.size ? t("gi.sendN", { n: picked.size }) : t("gi.send")}</Button>
    </> : undefined}>
      {data === undefined ? <div className="stack g8">{[0, 1, 2].map((i) => <span key={i} className="skeleton" style={{ height: 52 }} />)}</div> : !data ? null : data.friends.length === 0 ? (
        <div className="stack g12" style={{ alignItems: "center", textAlign: "center", padding: "8px 0" }}>
          <Icon name="users" size={28} className="muted" />
          <strong>{t("gi.noFriends")}</strong>
          <p className="t-small secondary">{t("gi.noFriendsBody")}</p>
          <a href="/app/chat?tab=friends" className="btn btn-primary btn-sm">{t("gi.findFriends")}</a>
        </div>
      ) : (
        <div className="stack g12">
          <div className="row between g8"><p className="t-small secondary">{t("gi.body")}</p><span className="t-meta" style={{ whiteSpace: "nowrap" }}>{t("gi.spots", { n: spots })}</span></div>
          {data.friends.length > 6 && <TextInput aria-label={t("gi.search")} placeholder={t("gi.search")} value={query} onChange={(e) => setQuery(e.target.value)} />}
          <ul className="invite-pick" role="listbox" aria-multiselectable>
            {list.map((f, i) => {
              const disabled = f.state === "member" || f.state === "invited";
              const on = picked.has(f.person.id);
              return (
                <li key={f.person.id} style={{ ["--i" as string]: i }}>
                  <button type="button" role="option" aria-selected={on} disabled={disabled} className="invite-pick-row" data-on={on || undefined} onClick={() => toggle(f.person.id)}>
                    <Avatar name={f.person.fullName} src={f.person.avatar} size={40} />
                    <span className="stack grow" style={{ minWidth: 0, textAlign: "left" }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>{f.person.fullName}</span>
                      <span className="t-small secondary truncate">
                        {f.state === "member" ? t("gi.stateMember") : f.state === "invited" ? t("gi.stateInvited") : f.state === "other_group" ? t("gi.stateOther", { group: f.otherGroup ?? "" }) : `@${f.person.username}`}
                      </span>
                    </span>
                    <span className="pick-tick" aria-hidden>{(on || disabled) && <Icon name="check" size={14} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Compact "my group" card for Home and the chat Groups tab: invites waiting for me first,
 * then my group with a one-tap way to bring friends in, or a clear way to start one.
 */
export function GroupSpot({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const mine = useApiLite(() => api.myGroup());
  const invites = useApiLite(() => api.myGroupInvites());
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (mine === undefined) return null;
  const pending = invites ?? [];
  const answer = async (messageId: string, decision: "accepted" | "declined", el: HTMLElement | null) => {
    setBusy(messageId + decision);
    try {
      const { groupId } = await api.respondGroupInvite(messageId, decision, { switchGroup: Boolean(mine) });
      if (decision === "accepted") { const { celebrate } = await import("@/lib/fx"); celebrate(el); router.push(`/app/groups/${groupId}`); }
      else toast(t("gi.declinedToast"));
    } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  return (
    <>
      {pending.slice(0, 1).map((p) => (
        <div key={p.messageId} className="invite-bubble invite-wide" style={{ ["--gc" as string]: p.group.color }}>
          <span className="invite-bubble-band" aria-hidden />
          <span className="t-small secondary row g8"><span className="pulse-dot" aria-hidden />{t("gi.pendingFrom", { name: p.from.fullName })}</span>
          <div className="row g12" style={{ alignItems: "center" }}>
            <GroupMark name={p.group.name} color={p.group.color} size={44} />
            <span className="stack grow" style={{ minWidth: 0 }}><strong className="invite-bubble-name truncate">{p.group.name}</strong><span className="t-small secondary">{t("gi.card.members", { n: p.group.members })}</span></span>
          </div>
          {mine && <span className="t-small secondary">{t("gi.card.switchHint", { group: mine.group.name })}</span>}
          <div className="row g8">
            <Button size="sm" variant="primary" icon="check" className="grow" loading={busy === p.messageId + "accepted"} onClick={(e) => answer(p.messageId, "accepted", e.currentTarget)}>{mine ? t("gi.card.switch") : t("gi.card.join")}</Button>
            <Button size="sm" variant="ghost" loading={busy === p.messageId + "declined"} onClick={(e) => answer(p.messageId, "declined", e.currentTarget)}>{t("gi.card.decline")}</Button>
          </div>
        </div>
      ))}
      {mine ? (
        <div className={`card pad stack g12 group-spot${compact ? " compact" : ""}`} style={{ ["--gc" as string]: mine.group.color }}>
          <a href={`/app/groups/${mine.group.id}`} className="row g12" style={{ minWidth: 0 }}>
            <GroupMark name={mine.group.name} color={mine.group.color} size={compact ? 36 : 44} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="t-small secondary">{t("gr.myGroup")}</span>
              <strong className="truncate">{mine.group.name}</strong>
            </span>
            <span className="t-meta num">{t("gr.level")} {mine.level}</span>
          </a>
          <div className="row g8">
            {mine.members.length < 30 && <Button size="sm" variant="primary" icon="userPlus" className="grow" onClick={() => setInvite(true)}>{t("gi.inviteFriends")}</Button>}
            <a href={`/app/chat/g_${mine.group.id}`} className="btn btn-secondary btn-sm"><Icon name="message" size={16} />{t("gr.chat")}</a>
          </div>
          <GroupInviteDialog open={invite} onClose={() => setInvite(false)} />
        </div>
      ) : pending.length === 0 && (
        <a href="/app/groups" className="card pad row g12 group-spot-empty">
          <span className="choice-icon" style={{ width: 40, height: 40 }}><Icon name="users" size={20} /></span>
          <span className="stack grow" style={{ minWidth: 0 }}><strong>{t("gr.create")}</strong><span className="t-small secondary">{t("gi.step2")} · {t("gi.step3").toLowerCase()}</span></span>
          <Icon name="chevronRight" size={16} className="muted" />
        </a>
      )}
    </>
  );
}

/** Minimal live query (re-runs when the store changes). */
function useApiLite<T>(fn: () => Promise<T>): T | undefined {
  const q = useApiHook(fn);
  return q.data;
}
