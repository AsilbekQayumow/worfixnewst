"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Announcement, UserProfile } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { Avatar, Button, Checkbox, Dialog, Empty, Notice, Segmented, Skeleton, TextArea, TextInput, useToast } from "./ui";

type Fields = Record<string, string>;

/** Writes to one user: an in-app notification, a chat message from the WORFIX team, or both. */
export function ContactDialog({ user, onClose }: { user: Pick<UserProfile, "id" | "fullName" | "email"> | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [v, setV] = useState({ title: "", body: "", link: "", asMessage: true, asNotification: true });
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!user) return;
    setBusy(true);
    setFields({});
    try {
      await api.adminContact(user.id, v);
      toast(t("ad.contactSent", { name: user.fullName }));
      setV({ title: "", body: "", link: "", asMessage: true, asNotification: true });
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setFields(e.fields);
      else toast(errText(e), "error");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(user)} onClose={onClose} title={t("ad.contactTitle", { name: user?.fullName ?? "" })} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" icon="send" loading={busy} onClick={send}>{t("chat.send")}</Button>
    </>}>
      <div className="stack g16">
        <span className="t-small secondary">{user?.email}</span>
        <div className="stack g8">
          <Checkbox checked={v.asNotification} onChange={(x) => setV((s) => ({ ...s, asNotification: x }))}>{t("ad.asNotification")}</Checkbox>
          <Checkbox checked={v.asMessage} onChange={(x) => setV((s) => ({ ...s, asMessage: x }))}>{t("ad.asMessage")}</Checkbox>
          {fields.channel && <span className="error-text">{t(fields.channel)}</span>}
        </div>
        {v.asNotification && <TextInput label={t("ad.msgTitle")} value={v.title} maxLength={120} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} error={fields.title} />}
        <TextArea label={t("ad.msgBody")} rows={5} value={v.body} maxLength={1000} onChange={(e) => setV((s) => ({ ...s, body: e.target.value }))} error={fields.body} />
        {v.asNotification && <TextInput label={t("ad.msgLink")} hint={t("ad.msgLinkHint")} value={v.link} onChange={(e) => setV((s) => ({ ...s, link: e.target.value }))} placeholder="/app/explore" />}
      </div>
    </Dialog>
  );
}

const AUDIENCES: Announcement["audience"][] = ["all", "volunteer", "organization"];

export function AdminComms() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const list = useApi(() => api.adminAnnouncements());
  const users = useApi(() => api.adminUsers());
  const [v, setV] = useState({ title: "", body: "", link: "", audience: "all" as Announcement["audience"] });
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [q, setQ] = useState("");
  const [to, setTo] = useState<UserProfile | null>(null);
  const [del, setDel] = useState<string | null>(null);

  const reach = useMemo(() => (users.data ?? []).filter((u) => u.status === "active" && (v.audience === "all" || u.role === v.audience)).length, [users.data, v.audience]);
  const found = q.trim().length < 2 ? [] : (users.data ?? []).filter((u) => `${u.fullName} ${u.email} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);

  const publish = async () => {
    setBusy(true);
    setFields({});
    try {
      await api.publishAnnouncement(v);
      toast(t("ad.announced", { n: reach }));
      setV({ title: "", body: "", link: "", audience: "all" });
      setConfirm(false);
    } catch (e) {
      setConfirm(false);
      if (e instanceof ValidationError) setFields(e.fields);
      else toast(errText(e), "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="stack g32">
      <section className="stack g12">
        <div className="stack g4">
          <h2 className="t-h2">{t("ad.toOne")}</h2>
          <p className="t-small secondary">{t("ad.toOneSub")}</p>
        </div>
        <div className="card pad stack g12">
          <TextInput placeholder={t("ad.searchUsers")} aria-label={t("ad.searchUsers")} value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && (found.length === 0 ? <p className="t-small muted">{t("ad.noMatch")}</p> : (
            <div className="rows">
              {found.map((u) => (
                <div key={u.id} className="row-item">
                  <Avatar name={u.fullName} src={u.avatar} size={32} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ fontWeight: 500 }}>{u.fullName}</span>
                    <span className="t-small secondary truncate">{u.email} · {t(`role.${u.role}`)}</span>
                  </span>
                  <Button size="sm" icon="send" onClick={() => setTo(u)}>{t("ad.write")}</Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="stack g12">
        <div className="stack g4">
          <h2 className="t-h2">{t("ad.toAll")}</h2>
          <p className="t-small secondary">{t("ad.toAllSub")}</p>
        </div>
        <div className="card pad-lg stack g16">
          <Segmented label={t("ad.audience")} value={v.audience} onChange={(a) => setV((s) => ({ ...s, audience: a }))} items={AUDIENCES.map((a) => ({ value: a, label: t(`ad.aud.${a}`) }))} />
          <TextInput label={t("ad.msgTitle")} value={v.title} maxLength={120} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} error={fields.title} />
          <TextArea label={t("ad.msgBody")} rows={5} value={v.body} maxLength={2000} onChange={(e) => setV((s) => ({ ...s, body: e.target.value }))} error={fields.body} />
          <TextInput label={t("ad.msgLink")} hint={t("ad.msgLinkHint")} value={v.link} onChange={(e) => setV((s) => ({ ...s, link: e.target.value }))} placeholder="/app/explore" />
          <div className="row between wrap g12">
            <span className="t-small secondary">{t("ad.reach", { n: reach })}</span>
            <Button variant="primary" icon="send" disabled={!v.title.trim() || !v.body.trim()} onClick={() => setConfirm(true)}>{t("ad.publish")}</Button>
          </div>
        </div>

        {!list.data ? <Skeleton rows={2} /> : list.data.length === 0 ? <div className="card"><Empty icon="bell" title={t("ad.noAnnouncements")} /></div> : (
          <div className="card rows">
            {list.data.map((a) => (
              <div key={a.id} className="row-item" style={{ alignItems: "flex-start" }}>
                <Icon name="bell" className="muted" />
                <span className="stack g4 grow" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{a.title}</span>
                  <span className="t-small secondary" style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
                  <span className="t-meta">{f.dayTime(a.createdAt)} · {t(`ad.aud.${a.audience}`)} · {t("ad.reach", { n: a.reach })}{a.link ? ` · ${a.link}` : ""}</span>
                </span>
                <Button size="sm" variant="ghost" icon="trash" iconOnly aria-label={t("chat.delete")} onClick={() => setDel(a.id)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t("ad.confirmTitle")} footer={<>
        <Button variant="ghost" onClick={() => setConfirm(false)}>{t("a.cancel")}</Button>
        <Button variant="primary" loading={busy} onClick={publish}>{t("ad.publish")}</Button>
      </>}>
        <Notice tone="warn">{t("ad.confirmBody", { n: reach, audience: t(`ad.aud.${v.audience}`) })}</Notice>
      </Dialog>
      <Dialog open={Boolean(del)} onClose={() => setDel(null)} title={t("ad.deleteAnnTitle")} footer={<>
        <Button variant="ghost" onClick={() => setDel(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { const id = del!; setDel(null); try { await api.deleteAnnouncement(id); } catch (e) { toast(errText(e), "error"); } }}>{t("chat.delete")}</Button>
      </>}>
        <p className="t-small secondary">{t("ad.deleteAnnBody")}</p>
      </Dialog>
      <ContactDialog user={to} onClose={() => setTo(null)} />
    </div>
  );
}

/** Banner with the newest unread announcement, for the volunteer and organization home pages. */
export function AnnouncementBanner() {
  const { t } = useI18n();
  const q = useApi(() => api.latestAnnouncement());
  const a = q.data;
  if (!a) return null;
  return (
    <div className="announce card pad row g12" role="status">
      <Icon name="bell" />
      <span className="stack g4 grow" style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 500 }}>{a.title}</span>
        <span className="t-small secondary" style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
        {a.link && (a.link.startsWith("/")
          ? <Link className="link t-small" href={a.link}>{t("ad.openLink")}</Link>
          : <a className="link t-small" href={a.link} target="_blank" rel="noreferrer">{t("ad.openLink")}</a>)}
      </span>
      <Button size="sm" variant="ghost" icon="x" iconOnly aria-label={t("ad.dismiss")} onClick={() => void api.markNotificationsRead([])} />
    </div>
  );
}
