"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { NewsPost } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, ValidationError, type NewsInput } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { productPhoto } from "./admin-shop";
import { Icon } from "./icons";
import { Button, Checkbox, Dialog, Empty, Segmented, Select, Skeleton, Status, TextArea, TextInput, useToast } from "./ui";

/** Sub-navigation of the admin "Communication" section: news, announcements, messages. */
export function AdminCommsTabs({ current }: { current: "news" | "announce" | "chat" }) {
  const { t } = useI18n();
  const items = [
    { id: "news", href: "/admin?tab=comms", label: t("nw.title"), icon: "list" as const },
    { id: "announce", href: "/admin?tab=comms&sub=announce", label: t("ad.announcements"), icon: "bell" as const },
    { id: "chat", href: "/admin/chat", label: t("nav.chat"), icon: "message" as const },
  ];
  return (
    <nav className="subnav" aria-label={t("nav.comms")}>
      {items.map((i) => <Link key={i.id} href={i.href} aria-current={current === i.id ? "page" : undefined}><Icon name={i.icon} size={16} />{i.label}</Link>)}
    </nav>
  );
}

const CATS: NewsPost["category"][] = ["news", "event", "update", "story", "partner"];
const empty = (): NewsInput => ({ title: "", summary: "", body: "", cover: null, category: "news", audience: "all", status: "published", pinned: false, publishAt: "", link: "" });
const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function NewsEditor({ post, onClose }: { post: (NewsInput & { id?: string }) | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [v, setV] = useState<NewsInput>(post ?? empty());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof NewsInput>(k: K, x: NewsInput[K]) => setV((s) => ({ ...s, [k]: x }));
  const save = async (status: NewsPost["status"]) => {
    setBusy(true); setFields({});
    try {
      await api.saveNews({ ...v, status, publishAt: v.publishAt ? new Date(v.publishAt).toISOString() : "" }, post?.id);
      toast(status === "published" ? t("nw.published") : t("nw.saved"));
      onClose();
    } catch (e) { if (e instanceof ValidationError) setFields(e.fields); else toast(errText(e), "error"); } finally { setBusy(false); }
  };
  const scheduled = v.publishAt && Date.parse(v.publishAt) > Date.now();
  return (
    <Dialog open onClose={onClose} wide title={post?.id ? t("nw.edit") : t("nw.new")} footer={<>
      <Button variant="ghost" onClick={() => setPreview((p) => !p)} icon="eye">{preview ? t("nw.editMode") : t("nw.preview")}</Button>
      <span className="grow" />
      <Button onClick={() => save("draft")} loading={busy}>{t("nw.saveDraft")}</Button>
      <Button variant="primary" icon="send" onClick={() => save("published")} loading={busy}>{scheduled ? t("nw.schedule") : t("nw.publish")}</Button>
    </>}>
      {preview ? (
        <article className="stack g12 news-article">
          {v.cover && <img src={v.cover} alt="" className="news-article-cover" />}
          <span className="t-small secondary">{t(`nw.cat.${v.category}`)}</span>
          <h2 className="t-h1">{v.title || "—"}</h2>
          {v.summary && <p className="secondary">{v.summary}</p>}
          <div className="prose news-text">{v.body}</div>
        </article>
      ) : (
        <div className="stack g16">
          <div className="news-cover-pick">
            {v.cover ? <img src={v.cover} alt="" /> : <span className="t-small muted row g8"><Icon name="image" size={18} />{t("nw.coverHint")}</span>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { set("cover", await productPhoto(f, 960, 540)); } catch (err) { toast(errText(err), "error"); }
              e.target.value = "";
            }} />
            <div className="row g8">
              <Button size="sm" icon="upload" onClick={() => file.current?.click()}>{v.cover ? t("nw.coverChange") : t("nw.cover")}</Button>
              {v.cover && <Button size="sm" variant="ghost" onClick={() => set("cover", null)}>{t("a.delete")}</Button>}
            </div>
            {fields.cover && <span className="error-text">{t(fields.cover)}</span>}
          </div>
          <TextInput label={t("nw.titleLabel")} value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} error={fields.title} hint={`${v.title.length} / 120`} />
          <TextArea label={t("nw.summary")} rows={2} maxLength={240} value={v.summary} onChange={(e) => set("summary", e.target.value)} error={fields.summary} hint={t("nw.summaryHint")} />
          <TextArea label={t("nw.body")} rows={9} maxLength={8000} value={v.body} onChange={(e) => set("body", e.target.value)} error={fields.body} hint={`${v.body.length} / 8000 · ${t("nw.bodyHint")}`} />
          <div className="grid cols-3">
            <Select label={t("nw.category")} value={v.category} onChange={(e) => set("category", e.target.value as NewsPost["category"])}>
              {CATS.map((c) => <option key={c} value={c}>{t(`nw.cat.${c}`)}</option>)}
            </Select>
            <Select label={t("ad.audience")} value={v.audience} onChange={(e) => set("audience", e.target.value as NewsPost["audience"])}>
              {(["all", "volunteer", "organization"] as const).map((a) => <option key={a} value={a}>{t(`ad.aud.${a}`)}</option>)}
            </Select>
            <TextInput label={t("nw.publishAt")} type="datetime-local" value={v.publishAt} onChange={(e) => set("publishAt", e.target.value)} error={fields.publishAt} hint={t("nw.publishAtHint")} />
          </div>
          <TextInput label={t("ad.msgLink")} hint={t("ad.msgLinkHint")} value={v.link} onChange={(e) => set("link", e.target.value)} placeholder="/app/missions" />
          <Checkbox checked={v.pinned} onChange={(x) => set("pinned", x)}>{t("nw.pin")}</Checkbox>
        </div>
      )}
    </Dialog>
  );
}

/** Admin: write, schedule, pin and publish news shown on everyone's home page. */
export function AdminNews() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.adminNews());
  const [edit, setEdit] = useState<(NewsInput & { id?: string }) | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [del, setDel] = useState<NewsPost | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(errText(e), "error"); } };
  const list = (q.data ?? []).filter((n) => filter === "all" || n.status === filter);
  const stateOf = (n: NewsPost) => (n.status === "draft" ? "draft" : Date.parse(n.publishAt) > Date.now() ? "scheduled" : "live");
  return (
    <div className="stack g16">
      <div className="row between g12 wrap">
        <Segmented value={filter} onChange={setFilter} items={[{ value: "all", label: t("rv.all") }, { value: "published", label: t("nw.st.published") }, { value: "draft", label: t("nw.st.draft") }]} />
        <Button variant="primary" icon="plus" onClick={() => setEdit(empty())}>{t("nw.new")}</Button>
      </div>
      {!q.data ? <Skeleton rows={3} height={80} /> : list.length === 0 ? <div className="card"><Empty icon="list" title={t("nw.none")} body={t("nw.noneBody")} /></div> : (
        <div className="card rows">
          {list.map((n) => {
            const st = stateOf(n);
            return (
              <div key={n.id} className="row-item news-admin-row">
                <span className="news-thumb">{n.cover ? <img src={n.cover} alt="" /> : <Icon name="list" size={18} />}</span>
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ fontWeight: 500 }}>{n.pinned && <Icon name="pin" size={13} />} {n.title}</span>
                  <span className="t-small secondary truncate">{t(`nw.cat.${n.category}`)} · {t(`ad.aud.${n.audience}`)} · {st === "scheduled" ? t("nw.scheduledFor", { at: f.dayTime(n.publishAt) }) : f.relative(n.updatedAt)}</span>
                </span>
                <Status tone={st === "live" ? "ok" : st === "scheduled" ? "info" : "neutral"}>{t(`nw.state.${st}`)}</Status>
                <Button size="sm" variant="ghost" iconOnly icon="pin" aria-label={n.pinned ? t("nw.unpin") : t("nw.pin")} aria-pressed={n.pinned} onClick={() => run(() => api.setNewsFlags(n.id, { pinned: !n.pinned }), n.pinned ? t("nw.unpinned") : t("nw.pinned"))} />
                {n.status === "draft"
                  ? <Button size="sm" onClick={() => run(() => api.setNewsFlags(n.id, { status: "published" }), t("nw.published"))}>{t("nw.publish")}</Button>
                  : <Button size="sm" variant="ghost" onClick={() => run(() => api.setNewsFlags(n.id, { status: "draft" }), t("nw.unpublished"))}>{t("nw.unpublish")}</Button>}
                <Button size="sm" variant="ghost" iconOnly icon="edit" aria-label={t("a.edit")} onClick={() => setEdit({ ...n, link: n.link ?? "", publishAt: localInput(n.publishAt) })} />
                <Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={t("a.delete")} onClick={() => setDel(n)} />
              </div>
            );
          })}
        </div>
      )}
      {edit && <NewsEditor post={edit} onClose={() => setEdit(null)} />}
      <Dialog open={Boolean(del)} onClose={() => setDel(null)} title={t("nw.deleteTitle")} footer={<>
        <Button variant="ghost" onClick={() => setDel(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={() => { const n = del!; setDel(null); void run(() => api.deleteNews(n.id), t("nw.deleted")); }}>{t("a.delete")}</Button>
      </>}><p className="t-small secondary">{del?.title}</p></Dialog>
    </div>
  );
}
