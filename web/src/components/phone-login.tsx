"use client";
import { useEffect, useRef, useState } from "react";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError, type SelfUser } from "@/lib/store/api";
import { FIREBASE } from "@/lib/store/db";
import { Icon } from "./icons";
import { Button, Notice, TextInput } from "./ui";

/** Sign in (or sign up as a volunteer) with a phone number and an SMS code. */
export function PhoneLogin({ onDone }: { onDone: (u: SelfUser) => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [phone, setPhone] = useState("+998 ");
  const [sent, setSent] = useState<{ phone: string; devCode: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try { setSent(await api.phoneStart(phone, "recaptcha-box")); setWait(60); setCode(""); }
    catch (err) { setError(err instanceof ValidationError ? t(Object.values(err.fields)[0]) : errText(err)); } finally { setBusy(false); }
  };
  const confirm = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try { onDone(await api.phoneConfirm(typed ?? code)); }
    catch (err) { setError(err instanceof ValidationError ? t(Object.values(err.fields)[0]) : errText(err)); } finally { setBusy(false); }
  };

  return (
    <div className="stack g16">
      {error && <Notice tone="bad">{error}</Notice>}
      {!sent ? (
        <form className="stack g16" onSubmit={send} noValidate>
          <TextInput label={t("auth.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint={t("auth.phoneHint")} />
          <Button type="submit" variant="primary" size="lg" block loading={busy} icon="phone">{t("auth.sendCode")}</Button>
        </form>
      ) : (
        <form className="stack g16" onSubmit={confirm} noValidate>
          <p className="t-small secondary">{t("auth.codeSent", { phone: sent.phone })} <button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => { setSent(null); setError(null); }}>{t("auth.changePhone")}</button></p>
          {sent.devCode && <Notice tone="info">{t("auth.demoCode", { code: sent.devCode })}</Notice>}
          <OtpInput value={code} onChange={setCode} onComplete={(c) => void confirm(undefined, c)} />
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={code.length !== 6}>{t("auth.confirmCode")}</Button>
          <Button variant="ghost" size="sm" disabled={wait > 0 || busy} onClick={() => void send()}>{wait > 0 ? t("auth.resendIn", { s: wait }) : t("auth.resend")}</Button>
        </form>
      )}
      <div id="recaptcha-box" />
      {FIREBASE && <p className="t-small muted row g8"><Icon name="shield" size={14} />{t("auth.phoneNote")}</p>}
    </div>
  );
}

/** Six boxes for the SMS code; paste fills all of them. */
function OtpInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: (code: string) => void }) {
  const { t } = useI18n();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const setAt = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, "").slice(0, 6);
    onChange(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.length === 6) onComplete(next);
  };
  return (
    <div className="otp" role="group" aria-label={t("auth.code")}>
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className="input otp-box" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1}
          aria-label={t("auth.codeDigit", { n: i + 1 })} value={value[i] ?? ""}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => { if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
          onPaste={(e) => { const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); if (d) { e.preventDefault(); onChange(d); refs.current[Math.min(5, d.length)]?.focus(); if (d.length === 6) onComplete(d); } }} />
      ))}
    </div>
  );
}

declare global { interface Window { onTelegramAuth?: (u: Record<string, string | number>) => void } }

/** Telegram Login Widget (shown only when the bot is configured and Firebase is on). */
export function TelegramLogin({ onDone }: { onDone: (u: SelfUser) => void }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
  useEffect(() => {
    if (!bot || !box.current) return;
    window.onTelegramAuth = async (user) => {
      setBusy(true); setError(null);
      try { onDone(await api.telegramLogin(user)); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    box.current.replaceChildren(s);
    return () => { delete window.onTelegramAuth; };
  }, [bot, onDone, errText]);
  if (!bot || !FIREBASE) return <Notice tone="info">{t("auth.telegramOff")}</Notice>;
  return (
    <div className="stack g12" style={{ alignItems: "center" }}>
      {error && <Notice tone="bad">{error}</Notice>}
      <p className="t-small secondary">{t("auth.telegramBody")}</p>
      <div ref={box} aria-busy={busy} />
    </div>
  );
}

export const telegramEnabled = () => Boolean(process.env.NEXT_PUBLIC_TELEGRAM_BOT) && FIREBASE;
