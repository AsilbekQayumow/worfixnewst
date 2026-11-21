"use client";
import { AdminCommsTabs } from "@/components/admin-news";
import { ChatView } from "@/components/chat-view";

export default function Chat() {
  return <div className="stack g16"><AdminCommsTabs current="chat" /><ChatView openId={null} base="/admin/chat" /></div>;
}
