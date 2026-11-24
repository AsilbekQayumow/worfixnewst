"use client";
/**
 * v5: everything the WORFIX app (Android/iOS) adds on top of the website. Renders nothing in a browser.
 *  • links and app shortcuts open the right page (appUrlOpen, launch URL)
 *  • push notifications: permission, token registration, tap → page, a toast while the app is open
 *  • widgets: a widget token for this phone; widgets refresh when data changes (and natively when the app is left)
 *  • photos shared into the app (Share → WORFIX) → pick the mission report they belong to
 *  • the optional biometric app lock
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  appPlugin, dataUrlToFile, isNative, lockEnabled, onSharedFiles, platform, plugin, push, setSharedFiles, sharedFiles, worfix,
} from "@/lib/native";
import { api, onBeforeLogout } from "@/lib/store/api";
import { callFunction } from "@/lib/store/cloud";
import { FIREBASE, subscribe } from "@/lib/store/db";
import { useApi } from "@/lib/store/hooks";
import { CATEGORY_ICON, Icon } from "./icons";
import { useMe } from "./providers";
import { Button, Dialog, useToast } from "./ui";

const PUSH_ASKED = "worfix.push.asked";

function samePath(url: URL) {
  return `${url.pathname}${url.search}${url.hash}` === `${location.pathname}${location.search}${location.hash}`;
}

/** worfix.site links (app links, shortcuts, widget taps) → client-side navigation. */
function DeepLinks() {
  const router = useRouter();
  useEffect(() => {
    let off: (() => void) | undefined;
    const open = (raw: string) => {
      try {
        let url = new URL(raw, location.origin);
        // worfix://open/app/map (iOS widgets, Live Activity, quick actions) → /app/map
        if (url.protocol === "worfix:") url = new URL(`${url.pathname}${url.search}${url.hash}`, location.origin);
        else if (!/(^|\.)worfix\.site$/.test(url.hostname) && url.hostname !== location.hostname) return;
        if (!url.pathname.startsWith("/")) return;
        if (!samePath(url)) router.push(`${url.pathname}${url.search}${url.hash}`);
      } catch { /* not a URL */ }
    };
    void appPlugin().then(async (app) => {
      const h = await app.addListener("appUrlOpen", ((e: { url: string }) => open(e.url)) as never);
      off = () => void h.remove();
      const launch = await (app as unknown as { getLaunchUrl(): Promise<{ url: string } | undefined> }).getLaunchUrl().catch(() => undefined);
      if (launch?.url) open(launch.url);
    }).catch(() => {});
    return () => off?.();
  }, [router]);
  return null;
}

/** Push: ask once after sign-in, register the token with the server, open the page of a tapped push. */
function Push() {
  const { me } = useMe();
  const router = useRouter();
  const toast = useToast();
  const token = useRef<string | null>(null);
  const uid = me?.id ?? null;

  useEffect(() => {
    if (!uid || !FIREBASE) return;
    let cancelled = false;
    const handles: { remove(): Promise<void> }[] = [];
    void (async () => {
      const info = await (await worfix()).info().catch(() => null);
      if (!info?.push) return; // Firebase is not set up in this build
      const p = await push();
      handles.push(await p.addListener("registration", (async (t: { value: string }) => {
        token.current = t.value;
        await callFunction("push-register", { token: t.value, platform: platform() }).catch(() => undefined);
      }) as never));
      handles.push(await p.addListener("pushNotificationActionPerformed", ((a: { notification: { data?: { link?: string } } }) => {
        const link = a.notification.data?.link;
        if (link && link.startsWith("/")) router.push(link);
      }) as never));
      handles.push(await p.addListener("pushNotificationReceived", ((n: { title?: string; body?: string }) => {
        if (n.title) toast(n.body ? `${n.title} · ${n.body}` : n.title);
      }) as never));
      if (cancelled) return;
      if (platform() === "android") {
        await p.createChannel({ id: "worfix", name: "WORFIX", importance: 4, visibility: 1, vibration: true, lights: true, lightColor: "#1fa84a" }).catch(() => {});
      }
      let perm = await p.checkPermissions();
      if (perm.receive !== "granted" && perm.receive !== "denied" && !localStorage.getItem(PUSH_ASKED)) {
        localStorage.setItem(PUSH_ASKED, "1");
        await new Promise((r) => setTimeout(r, 2500));
        if (cancelled) return;
        perm = await p.requestPermissions();
      }
      if (perm.receive === "granted") await p.register();
    })().catch(() => {});
    const off = onBeforeLogout(async () => {
      if (token.current) await callFunction("push-unregister", { token: token.current });
      token.current = null;
      await push().then((p) => p.unregister()).catch(() => {});
    });
    return () => { cancelled = true; off(); handles.forEach((h) => void h.remove()); };
  }, [uid, router, toast]);
  return null;
}

/** Widgets: a read-only widget token for this phone; refresh when data changes (at most every 2 min). */
function Widgets() {
  const { me } = useMe();
  const uid = me?.id ?? null;
  useEffect(() => {
    if (!uid || !FIREBASE) return;
    let last = 0;
    let timer: number | undefined;
    const refresh = (now = false) => {
      window.clearTimeout(timer);
      const wait = now ? 0 : Math.max(0, last + 120_000 - Date.now());
      timer = window.setTimeout(() => { last = Date.now(); void worfix().then((w) => w.refreshWidgets()).catch(() => {}); }, wait);
    };
    void (async () => {
      const w = await worfix();
      const info = await w.info();
      if (!info.hasSession || info.sessionUser !== uid) {
        const r = await callFunction("widget-token");
        if (!r.ok) return;
        const { token } = (await r.json()) as { token: string };
        await w.setSession({ token, userId: uid });
      }
      refresh(true);
    })().catch(() => {});
    // (Leaving the app also refreshes them: MainActivity / AppDelegate do it natively.)
    const unsub = subscribe(() => refresh());
    const off = onBeforeLogout(async () => {
      const { token } = await (await worfix()).clearSession();
      if (token) await callFunction("widget-token", { revoke: token });
    });
    return () => { window.clearTimeout(timer); unsub(); off(); };
  }, [uid]);
  return null;
}

/** Share → WORFIX: photos arrive here; the volunteer picks the mission report they belong to. */
function ShareInbox() {
  const { t } = useI18n();
  const { me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const take = useCallback(async () => {
    const { files } = await (await worfix()).takeShared();
    if (!files.length) return;
    setSharedFiles(files.map((f, i) => dataUrlToFile(`data:${f.type};base64,${f.data}`, f.name || `shared-${i + 1}.jpg`)));
    setOpen(true);
  }, []);

  useEffect(() => onSharedFiles(() => setCount(sharedFiles().length)), []);
  useEffect(() => {
    if (!me) return;
    let h: { remove(): Promise<void> } | undefined;
    void take().catch(() => {});
    void worfix().then(async (w) => { h = await w.addListener("shared", (() => void take().catch(() => {})) as never); }).catch(() => {});
    return () => void h?.remove();
  }, [me, take]);
  // Once the evidence form has taken the photos, close.
  useEffect(() => { if (open && count === 0) setOpen(false); }, [count, open]);

  const close = () => { setOpen(false); setSharedFiles([]); };
  if (!me || !open) return null;
  return (
    <Dialog open onClose={close} title={t("nt.shareTitle", { n: count })}>
      <ShareTargets onPick={(id) => { setOpen(false); if (pathname !== `/app/missions/${id}`) router.push(`/app/missions/${id}#evidence`); }} onNone={close} />
    </Dialog>
  );
}

function ShareTargets({ onPick, onNone }: { onPick: (missionId: string) => void; onNone: () => void }) {
  const { t } = useI18n();
  const q = useApi(() => api.myParticipations());
  const open = (q.data ?? []).filter((x) => x.participant.status === "accepted" && x.submission?.verificationStatus !== "approved" && x.submission?.verificationStatus !== "rejected");
  if (q.loading) return <p className="secondary">…</p>;
  if (!open.length) {
    return (
      <div className="stack g16">
        <p className="secondary">{t("nt.shareNone")}</p>
        <div className="row g8 wrap">
          <Link href="/app/missions" className="btn btn-primary" onClick={onNone}><Icon name="search" size={16} />{t("nt.shareFind")}</Link>
          <Button variant="ghost" onClick={onNone}>{t("nt.shareDiscard")}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="stack g12">
      <p className="secondary">{t("nt.shareBody")}</p>
      <div className="stack g8">
        {open.map((x) => (
          <button key={x.mission.id} type="button" className="share-pick" onClick={() => onPick(x.mission.id)}>
            <span className={`share-pick-ico cat-${x.mission.category}`}><Icon name={CATEGORY_ICON[x.mission.category]} size={18} /></span>
            <span className="stack g4" style={{ minWidth: 0, flex: 1 }}>
              <strong className="ellipsis">{x.mission.title}</strong>
              <span className="t-small muted">{t(`cat.${x.mission.category}`)}</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={onNone}>{t("nt.shareDiscard")}</Button>
    </div>
  );
}

/** Optional biometric lock: on start and after a minute in the background. */
function AppLock() {
  const { t } = useI18n();
  const [locked, setLocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const asking = useRef(false);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      const r = await (await worfix()).verifyBiometric({ title: t("nt.bioTitle"), reason: t("nt.lockBody"), cancel: t("a.cancel") });
      if (r.ok) setLocked(false);
    } catch { /* stays locked */ } finally { asking.current = false; }
  }, [t]);

  useEffect(() => {
    if (lockEnabled()) setLocked(true);
    const vis = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      if (lockEnabled() && hiddenAt.current && Date.now() - hiddenAt.current > 60_000) setLocked(true);
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);
  useEffect(() => { if (locked) void unlock(); }, [locked, unlock]);

  if (!locked) return null;
  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-labelledby="app-lock-title">
      <div className="app-lock-card">
        <span className="app-lock-badge"><img src="/worfix-logo.svg" alt="" width={64} height={34} /></span>
        <h2 id="app-lock-title" className="t-h2">{t("nt.lockTitle")}</h2>
        <p className="secondary">{t("nt.lockBody")}</p>
        <Button variant="primary" size="lg" icon="lock" onClick={() => void unlock()}>{t("nt.unlock")}</Button>
      </div>
    </div>
  );
}

export function NativeBridge() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    setNative(true);
    document.documentElement.classList.add("is-native");
    document.documentElement.dataset.platform = platform();
    // The status and navigation bar icons follow the theme (Capacitor 8 SystemBars).
    const apply = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      void plugin<{ setStyle(o: { style: "DARK" | "LIGHT" }): Promise<void> }>("SystemBars").then((s) => s.setStyle({ style: dark ? "DARK" : "LIGHT" })).catch(() => {});
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  if (!native) return null;
  return (
    <>
      <DeepLinks />
      <Push />
      <Widgets />
      <ShareInbox />
      <AppLock />
    </>
  );
}
