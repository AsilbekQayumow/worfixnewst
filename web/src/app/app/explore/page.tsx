"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** "Explore" is now a tab of Missions. */
export default function AppExplore() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/missions?tab=explore"); }, [router]);
  return null;
}
