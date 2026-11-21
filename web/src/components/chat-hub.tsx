"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { ChatView } from "./chat-view";
import { FriendsPanel } from "./friends-panel";
import { Tabs } from "./ui";

type Tab = "chats" | "groups" | "friends";

function Hub({ openId }: { openId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const raw = useSearchParams().get("tab");
  const tab: Tab = openId ? (openId.startsWith("g_") ? "groups" : "chats") : raw === "groups" || raw === "friends" ? raw : "chats";
  const b = useApi(() => api.badges()).data;
  const go = (v: Tab) => router.push(v === "chats" ? "/app/chat" : `/app/chat?tab=${v}`);
  return (
    <div className="stack g16 chat-hub" data-open={Boolean(openId) || undefined}>
      <div className="chat-hub-tabs">
        <Tabs value={tab} onChange={go} items={[
          { value: "chats", label: t("chat.personal") },
          { value: "groups", label: t("chat.groups") },
          { value: "friends", label: t("nav.friends"), count: b?.friends || undefined },
        ]} />
      </div>
      {tab === "friends" ? <FriendsPanel /> : <ChatView openId={openId} kind={tab === "groups" ? "group" : "direct"} />}
    </div>
  );
}

export function ChatHub({ openId }: { openId: string | null }) {
  return <Suspense fallback={null}><Hub openId={openId} /></Suspense>;
}
