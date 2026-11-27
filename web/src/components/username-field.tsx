"use client";
import { useEffect, useState } from "react";
import { Field } from "./ui";
import { Icon } from "./icons";
import { useI18n } from "@/lib/i18n";
import { cleanUsername, usernameProblem } from "@/lib/domain/validation";
import { api } from "@/lib/store/api";

/** v8: the username people sign in with — "@" in front, live check that it is free. */
export function UsernameField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "checking" | "free" | "taken" | "bad">("idle");
  const name = cleanUsername(value);

  useEffect(() => {
    if (!name) { setState("idle"); return; }
    if (usernameProblem(name)) { setState("bad"); return; }
    setState("checking");
    let live = true;
    const id = setTimeout(() => {
      void api.usernameFree(name).then((free) => { if (live) setState(free === null ? "idle" : free ? "free" : "taken"); });
    }, 450);
    return () => { live = false; clearTimeout(id); };
  }, [name]);

  const hint = state === "free" ? <span className="uname-ok"><Icon name="check" size={14} /> {t("auth.usernameFree")}</span>
    : state === "taken" ? <span className="uname-bad">{t("e.usernameTaken")}</span>
    : state === "bad" ? <span className="uname-bad">{t(usernameProblem(name) ?? "v.username")}</span>
    : t("auth.usernameHint");
  return (
    <Field label={t("auth.username")} hint={hint} error={error} htmlFor="reg-username">
      <div className="input-wrap uname">
        <span className="uname-at" aria-hidden>@</span>
        <input id="reg-username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={25}
          value={value} onChange={(e) => onChange(e.target.value.replace(/\s/g, "").toLowerCase())} aria-invalid={error || state === "taken" ? true : undefined} />
        {state === "checking" && <span className="spinner uname-spin" aria-hidden />}
      </div>
    </Field>
  );
}
