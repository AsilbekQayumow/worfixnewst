"use client";
import { Suspense } from "react";
import { ChatHub } from "@/components/chat-hub";

export default function Chat() {
  return <Suspense fallback={null}><ChatHub openId={null} /></Suspense>;
}
