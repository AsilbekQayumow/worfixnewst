"use client";
import { useParams } from "next/navigation";
import { AdminCommsTabs } from "@/components/admin-news";
import { ChatView } from "@/components/chat-view";

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  return <div className="stack g16"><AdminCommsTabs current="chat" /><ChatView openId={id} base="/admin/chat" /></div>;
}
