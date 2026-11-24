"use client";
/**
 * v5: the WORFIX app for Android and iOS is a Capacitor shell that opens this website. Inside the app the
 * native bridge (window.Capacitor) is injected into the page; this module is the only place that talks to it.
 * In a normal browser every function here is a no-op or answers "not available", so the site works unchanged.
 *
 * Plugins: Camera, PushNotifications, Haptics, App (official) and WorfixNative (our own: widgets, the walk
 * panel, biometrics, sharing into the app, saving and sharing images). The contract of WorfixNative is in
 * mobile/README.md; Android and iOS implement the same methods.
 */
import type { PluginListenerHandle } from "@capacitor/core";

interface CapGlobal { isNativePlatform?: () => boolean; getPlatform?: () => string }
const capGlobal = (): CapGlobal | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapGlobal }).Capacitor);

/** True inside the WORFIX app (Android or iOS). */
export const isNative = () => Boolean(capGlobal()?.isNativePlatform?.());
export const platform = (): "android" | "ios" | "web" => {
  const p = capGlobal()?.getPlatform?.();
  return p === "android" || p === "ios" ? p : "web";
};

type Listener = (data: never) => void;
interface Plugin { addListener(event: string, fn: Listener): Promise<PluginListenerHandle> }

const plugins = new Map<string, Promise<unknown>>();
/**
 * A native plugin by name (loads @capacitor/core on first use, only inside the app).
 * Capacitor's plugin proxy answers every property, `then` included, so a Promise must never resolve with it
 * (it would be treated as a thenable and call a native "then"): it is wrapped in a proxy without `then`.
 */
export function plugin<T>(name: string): Promise<T> {
  if (!isNative()) return Promise.reject(new Error("not-native"));
  let p = plugins.get(name);
  if (!p) {
    p = import("@capacitor/core").then(({ registerPlugin }) => {
      const target = registerPlugin<T & Plugin>(name) as unknown as Record<string | symbol, unknown>;
      return new Proxy({}, { get: (_, prop) => (prop === "then" ? undefined : target[prop]) });
    });
    plugins.set(name, p);
  }
  return p as Promise<T>;
}

/* ───────────── typed plugin surfaces (only what WORFIX uses) ───────────── */

export interface WalkPoint { lat: number; lng: number; t: number; acc: number | null }
export interface NativeInfo { version: string; build: string; biometric: "none" | "fingerprint" | "face" | "any"; hasLogin: boolean; hasSession: boolean; sessionUser: string | null; push: boolean }
export interface SharedFile { name: string; type: string; data: string }

export interface WorfixNativePlugin extends Plugin {
  info(): Promise<NativeInfo>;
  setSession(o: { token: string; userId: string }): Promise<void>;
  clearSession(): Promise<{ token: string | null }>;
  refreshWidgets(): Promise<void>;
  /** Starts the foreground walk (GPS keeps recording with the screen off; live panel on the lock screen). resume keeps the points so far. */
  startWalk(o: { color: string; labels: Record<string, string>; resume?: boolean }): Promise<void>;
  /** Points recorded since index `from`; `total` is the whole walk so far. */
  walkPoints(o: { from: number }): Promise<{ points: WalkPoint[]; total: number; running: boolean }>;
  /** Stops recording; clear also forgets the points. */
  stopWalk(o?: { clear?: boolean }): Promise<void>;
  verifyBiometric(o: { title: string; reason: string; cancel: string }): Promise<{ ok: boolean }>;
  saveLogin(o: { email: string; password: string; title: string; reason: string; cancel: string }): Promise<{ ok: boolean }>;
  loadLogin(o: { title: string; reason: string; cancel: string }): Promise<{ email: string; password: string }>;
  clearLogin(): Promise<void>;
  takeShared(): Promise<{ files: SharedFile[] }>;
  shareImage(o: { dataUrl: string; text: string; title: string }): Promise<void>;
  saveImage(o: { dataUrl: string; name: string }): Promise<{ ok: boolean }>;
  openSettings(): Promise<void>;
}

export const worfix = () => plugin<WorfixNativePlugin>("WorfixNative");

interface HapticsPlugin { impact(o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>; notification(o: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>; vibrate(o: { duration: number }): Promise<void> }
interface CameraPlugin { getPhoto(o: Record<string, unknown>): Promise<{ dataUrl?: string; format: string }> }
export interface PushPlugin extends Plugin {
  checkPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  requestPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  createChannel(c: { id: string; name: string; description?: string; importance?: 1 | 2 | 3 | 4 | 5; visibility?: -1 | 0 | 1; vibration?: boolean; lights?: boolean; lightColor?: string }): Promise<void>;
  removeAllDeliveredNotifications(): Promise<void>;
}
export interface AppPlugin extends Plugin { getInfo(): Promise<{ version: string; build: string }> }

export const push = () => plugin<PushPlugin>("PushNotifications");
export const appPlugin = () => plugin<AppPlugin>("App");

/* ───────────── small helpers used across the app ───────────── */

/** A short haptic tap; falls back to the browser vibration API. Never throws. */
export function haptic(kind: "light" | "medium" | "heavy" | "success" | "warning" = "light", ms = 18) {
  if (!isNative()) {
    try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
    return;
  }
  void plugin<HapticsPlugin>("Haptics").then((h) => (kind === "success" || kind === "warning"
    ? h.notification({ type: kind === "success" ? "SUCCESS" : "WARNING" })
    : h.impact({ style: kind === "heavy" ? "HEAVY" : kind === "medium" ? "MEDIUM" : "LIGHT" }))).catch(() => {});
}

/** Takes a photo with the native camera (null when cancelled). Compression happens later in prepareImage. */
export async function nativePhoto(): Promise<File | null> {
  const cam = await plugin<CameraPlugin>("Camera");
  try {
    const r = await cam.getPhoto({ quality: 85, width: 1600, height: 1600, resultType: "dataUrl", source: "CAMERA", correctOrientation: true, saveToGallery: false, allowEditing: false });
    return r.dataUrl ? dataUrlToFile(r.dataUrl, `worfix-${Date.now()}.jpg`) : null;
  } catch (e) {
    if (/cancel/i.test((e as Error).message ?? "")) return null;
    throw e;
  }
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64 = ""] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}

/** Saves an image: to the phone gallery in the app, as a download in a browser. */
export async function saveImage(dataUrl: string, name: string) {
  if (isNative()) {
    const r = await (await worfix()).saveImage({ dataUrl, name });
    return r.ok;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
  return true;
}

/** Opens the system share sheet with an image (app) — true when handled. */
export async function shareImage(dataUrl: string, text: string, title = "WORFIX") {
  if (!isNative()) return false;
  await (await worfix()).shareImage({ dataUrl, text, title });
  return true;
}

/* ───────────── images shared into the app (Share → WORFIX) ───────────── */

let shared: File[] = [];
const sharedListeners = new Set<() => void>();
export function setSharedFiles(files: File[]) { shared = files; sharedListeners.forEach((l) => l()); }
export const sharedFiles = () => shared;
/** Hands the shared photos to whoever asks first (the evidence form) and clears them. */
export function takeSharedFiles() { const f = shared; setSharedFiles([]); return f; }
export function onSharedFiles(l: () => void) { sharedListeners.add(l); return () => void sharedListeners.delete(l); }

/* ───────────── app lock / biometric login preferences (this device only) ───────────── */

const LOCK_KEY = "worfix.app.lock";
export const lockEnabled = () => { try { return localStorage.getItem(LOCK_KEY) === "1"; } catch { return false; } };
export const setLockEnabled = (on: boolean) => { try { if (on) localStorage.setItem(LOCK_KEY, "1"); else localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ } };
