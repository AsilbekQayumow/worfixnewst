"use client";
import { useParams } from "next/navigation";
import { ChatHub } from "@/components/chat-hub";

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  return <ChatHub openId={decodeURIComponent(id)} />;
}
