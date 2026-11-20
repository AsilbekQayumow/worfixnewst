"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { api, type SelfUser } from "@/lib/store/api";
import { onSyncError } from "@/lib/store/db";
import { useApi } from "@/lib/store/hooks";
import { ToastProvider, useToast } from "./ui";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = localStorage.getItem("worfix.theme") as Theme | null;
    setTheme(saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = useCallback(() => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; localStorage.setItem("worfix.theme", n); return n; }), []);
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

const MeCtx = createContext<{ me: SelfUser | null | undefined; reload: () => void }>({ me: undefined, reload: () => {} });
/** The signed-in user: undefined while loading, null when signed out. */
export const useMe = () => useContext(MeCtx);

function MeProvider({ children }: { children: ReactNode }) {
  const q = useApi(() => api.me());
  const { lang, setLang } = useI18n();
  const synced = useRef<string | null>(null);
  // Adopt the language saved on the account once per sign-in; afterwards the UI choice is saved to the account.
  useEffect(() => {
    const me = q.data;
    if (!me) { synced.current = null; return; }
    if (synced.current !== me.id) {
      synced.current = me.id;
      if (me.language && me.language !== lang) setLang(me.language);
      return;
    }
    if (me.language !== lang) void api.setLanguage(lang).catch(() => undefined);
  }, [q.data, lang, setLang]);
  return <MeCtx.Provider value={{ me: q.loading && q.data === undefined ? undefined : q.data ?? null, reload: q.reload }}>{children}</MeCtx.Provider>;
}

function SyncErrors() {
  const toast = useToast();
  const { t } = useI18n();
  useEffect(() => onSyncError((key) => toast(t(key), "error")), [toast, t]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <MeProvider>
            <SyncErrors />
            {children}
          </MeProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
