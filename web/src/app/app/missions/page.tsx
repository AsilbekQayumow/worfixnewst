"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** v3.2: missions live inside the Map menu (list view). Old links land there. */
function Go() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = new URLSearchParams(params.toString());
    q.set("view", "list");
    router.replace(`/app/map?${q.toString()}`);
  }, [params, router]);
  return null;
}

export default function MissionsRedirect() {
  return <Suspense fallback={null}><Go /></Suspense>;
}
