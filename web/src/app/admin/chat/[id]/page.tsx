"use client";
import { useParams } from "next/navigation";
import { ChatView } from "@/components/chat-view";

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  return <ChatView friendId={id} base="/admin/chat" />;
}
