"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getVersion, subscribe } from "./db";

export function useStoreVersion() {
  return useSyncExternalStore(subscribe, getVersion, () => 0);
}

export interface Query<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/* Design rec. 1: one place that knows which screens failed to load, so the shell can offer a single "Try again". */
const failed = new Map<symbol, () => void>();
const failListeners = new Set<() => void>();
let failCount = 0;
const emitFail = () => { failCount = failed.size; failListeners.forEach((l) => l()); };
export function useFailedQueries() {
  return useSyncExternalStore((l) => { failListeners.add(l); return () => failListeners.delete(l); }, () => failCount, () => 0);
}
export function retryFailed() { for (const r of [...failed.values()]) r(); }

/** Runs an async API call; re-runs when the store or deps change. Ignores stale responses. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const version = useStoreVersion();
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const key = useRef(Symbol("query"));
  useEffect(() => () => { if (failed.delete(key.current)) emitFail(); }, []);
  useEffect(() => {
    const mine = ++seq.current;
    fnRef.current()
      .then((data) => { if (mine === seq.current) { setState({ data, error: null, loading: false }); if (failed.delete(key.current)) emitFail(); } })
      .catch((error: Error) => {
        if (mine !== seq.current) return;
        setState((s) => {
          // a screen with nothing to show registers for the shell's "Try again" bar; sign-in errors are handled by the guards
          if (s.data === undefined && !/e\.signIn|forbidden/.test(error.message)) { failed.set(key.current, () => setNonce((n) => n + 1)); emitFail(); }
          return { data: s.data, error, loading: false };
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Wraps an async action with a pending flag. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const run = useCallback(async (...args: A) => {
    setPending(true);
    try { return await fn(...args); } finally { setPending(false); }
  }, [fn]);
  return [run, pending] as const;
}
