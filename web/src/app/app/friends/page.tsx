"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Friends now live in Chat → Friends. */
export default function Friends() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/chat?tab=friends"); }, [router]);
  return null;
}
