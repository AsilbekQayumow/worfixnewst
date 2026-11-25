"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Friends are found from Chat's search, not a separate section. */
export default function Friends() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/chat?find=1"); }, [router]);
  return null;
}
