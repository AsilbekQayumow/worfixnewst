"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

/** Registers the service worker and keeps the browser's install prompt for the settings button. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onPrompt = (e: Event) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((l) => l()); };
    const onInstalled = () => { deferred = null; listeners.forEach((l) => l()); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

export type InstallState = "installed" | "ready" | "ios" | "manual";

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const [, tick] = useState(0);
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean }>({ standalone: false, ios: false });
  useEffect(() => {
    setEnv({
      standalone: matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
    });
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const state: InstallState = env.standalone ? "installed" : deferred ? "ready" : env.ios ? "ios" : "manual";
  const install = async () => {
    if (!deferred) return;
    const d = deferred;
    await d.prompt();
    await d.userChoice.catch(() => undefined);
    deferred = null;
    listeners.forEach((l) => l());
  };
  return { state, install };
}
