"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { ChatView } from "./chat-view";
import { Icon } from "./icons";
import { PersonRow } from "./person-row";
import { Button, Empty, Skeleton, Tabs, useToast } from "./ui";

type Tab = "chats" | "groups";

/** Look someone up by name or username, on demand — no standing list of everyone on the platform. */
function PeopleSearch({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [q, setQ] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const needle = q.trim();
  const people = useApi(() => (needle ? api.people(needle) : Promise.resolve(null)), [needle]);
  useEffect(() => { field.current?.focus(); }, []);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } };
  return (
    <div className="stack g16 enter">
      <div className="input-wrap">
        <input ref={field} className="input" type="text" inputMode="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fr.searchPh")} aria-label={t("fr.searchPh")} style={{ paddingLeft: 36, paddingRight: 36 }} />
        <span style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }}><Icon name="search" size={18} /></span>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ position: "absolute", right: 4, top: 4 }} onClick={onClose} aria-label={t("a.close")}><Icon name="x" size={16} /></button>
      </div>
      {!needle ? <Empty icon="users" title={t("fr.searchHintTitle")} body={t("fr.searchHint")} /> : !people.data ? <Skeleton rows={3} /> : people.data.length === 0 ? <Empty icon="search" title={t("fr.noPeople")} /> : (
        <div className="card rows">
          {people.data.map((p) => (
            <PersonRow key={p.id} p={p} sub={p.nearby ? <>{t("fr.nearby")} · {t("lvl.short", { n: p.level })}</> : undefined} actions={
              p.relation === "friend" ? null
                : p.relation === "outgoing" ? <span className="t-small muted">{t("fr.pending")}</span>
                : <Button size="sm" variant={p.relation === "incoming" ? "primary" : "secondary"} icon="userPlus" onClick={() => run(() => api.sendFriendRequest(p.id), t("fr.requestSent"))}>
                    {p.relation === "incoming" ? t("fr.accept") : t("fr.add")}
                  </Button>
            } />
          ))}
        </div>
      )}
    </div>
  );
}

function Hub({ openId }: { openId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = openId ? (openId.startsWith("g_") ? "groups" : "chats") : raw === "groups" ? raw : "chats";
  const [searching, setSearching] = useState(params.get("find") === "1");
  const go = (v: Tab) => router.push(v === "chats" ? "/app/chat" : `/app/chat?tab=${v}`);
  return (
    <div className="stack g16 chat-hub" data-open={Boolean(openId) || undefined}>
      <div className="chat-hub-tabs row g8">
        <div className="grow"><Tabs value={tab} onChange={go} items={[
          { value: "chats", label: t("chat.personal") },
          { value: "groups", label: t("chat.groups") },
        ]} /></div>
        {!searching && <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setSearching(true)} aria-label={t("fr.find")} title={t("fr.find")}><Icon name="search" size={16} /></button>}
      </div>
      {searching ? <PeopleSearch onClose={() => setSearching(false)} /> : <ChatView openId={openId} kind={tab === "groups" ? "group" : "direct"} />}
    </div>
  );
}

export function ChatHub({ openId }: { openId: string | null }) {
  return <Suspense fallback={null}><Hub openId={openId} /></Suspense>;
}
