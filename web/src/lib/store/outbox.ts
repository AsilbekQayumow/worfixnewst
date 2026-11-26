"use client";
/**
 * v6 · feature 15: offline mode.
 *  • Reading: Firestore keeps a persistent local cache (cloud.ts), so seen missions, the profile and chats open offline.
 *    "Save for offline" also keeps a mission's text, checklist and address on the device.
 *  • Writing: a change made without a connection is applied on the device at once and waits in Firestore's own queue,
 *    which survives a reload. Here we keep the list the person sees ("Not sent yet": waiting / sending / failed).
 *    Document ids are deterministic (`${missionId}_${userId}`), so a retried send updates instead of duplicating.
 *  • Rewards are never shown for something still waiting: XP and Fixcoin come only from a reviewer's approval.
 */
import { useSyncExternalStore } from "react";
import type { Mission } from "../domain/types";

export interface Pending { id: string; label: string; at: string; status: "waiting" | "failed"; error?: string }

const KEY = "worfix.outbox";
const MKEY = "worfix.offline.missions";
const listeners = new Set<() => void>();
let list: Pending[] | null = null;
let snapshot: Pending[] = [];

function read(): Pending[] {
  if (list) return list;
  try { list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Pending[]; } catch { list = []; }
  snapshot = list;
  return list;
}
function write(next: Pending[]) {
  list = next.slice(-50);
  snapshot = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* full or private */ }
  listeners.forEach((l) => l());
}

/** How long a save may take before it is treated as "waiting for the network" and the screen moves on. */
export const SLOW_MS = 8000;

/**
 * Wraps a save (the Firestore batch). Online and fast: just awaits it. Offline or slow: records it as waiting,
 * lets the caller continue at once, and clears or marks it failed when the server answers.
 */
export function track(saved: Promise<void>, label: string): Promise<void> {
  if (typeof window === "undefined") return saved;
  const id = Math.random().toString(36).slice(2);
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    write([...read(), { id, label, at: new Date().toISOString(), status: "waiting" }]);
  };
  saved.then(
    () => { if (queued) write(read().filter((p) => p.id !== id)); },
    (e: unknown) => { if (queued) write(read().map((p) => (p.id === id ? { ...p, status: "failed", error: e instanceof Error ? e.message : String(e) } : p))); },
  );
  if (!navigator.onLine) { queue(); return Promise.resolve(); }
  return Promise.race([saved, new Promise<void>((resolve) => window.setTimeout(() => { queue(); resolve(); }, SLOW_MS))]);
}

export const dismissPending = (id: string) => write(read().filter((p) => p.id !== id));
/** After Firestore confirms every queued write, the list is empty. */
export const clearWaiting = () => write(read().filter((p) => p.status === "failed"));

export function usePending() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => { read(); return snapshot; }, () => [] as Pending[]);
}

export function useOnline() {
  return useSyncExternalStore(
    (l) => { window.addEventListener("online", l); window.addEventListener("offline", l); return () => { window.removeEventListener("online", l); window.removeEventListener("offline", l); }; },
    () => navigator.onLine,
    () => true,
  );
}

/* ── "save for offline": a mission's text, checklist and address on the device (no map tiles in this version) ── */
type SavedMission = Pick<Mission, "id" | "title" | "description" | "location" | "coordinates" | "date" | "duration" | "checklist" | "requirements" | "safety" | "equipment"> & { savedAt: string };

function savedMap(): Record<string, SavedMission> {
  try { return JSON.parse(localStorage.getItem(MKEY) ?? "{}") as Record<string, SavedMission>; } catch { return {}; }
}
export function saveForOffline(m: Mission) {
  const all = savedMap();
  all[m.id] = {
    id: m.id, title: m.title, description: m.description, location: m.location, coordinates: m.coordinates, date: m.date, duration: m.duration, checklist: m.checklist,
    requirements: m.requirements, safety: m.safety, equipment: m.equipment, savedAt: new Date().toISOString(),
  };
  const keep = Object.values(all).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)).slice(0, 30);
  try { localStorage.setItem(MKEY, JSON.stringify(Object.fromEntries(keep.map((x) => [x.id, x])))); } catch { /* full */ }
}
export const isSavedOffline = (id: string) => Boolean(savedMap()[id]);
export const savedMissions = () => Object.values(savedMap()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
