"use client";
import { isPreset, PresetArt } from "./avatar-presets";
import Link from "next/link";
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { useI18n } from "@/lib/i18n";
import type { Category, Difficulty, MissionStatus, VerificationStatus } from "@/lib/domain/types";
import { CATEGORY_ICON, Icon, type IconName } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ── buttons ── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";
type Size = "sm" | "md" | "lg";

export function Button({ variant = "secondary", size = "md", loading, icon, iconOnly, block, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: IconName; iconOnly?: boolean; block?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, iconOnly && "btn-icon", block && "btn-block", className)}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", icon, block, className, children, ...rest }:
  { href: string; variant?: Variant; size?: Size; icon?: IconName; block?: boolean; className?: string; children: ReactNode; "aria-label"?: string }) {
  return (
    <Link href={href} className={cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, block && "btn-block", className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </Link>
  );
}

/* ── form fields ── */
export function Field({ label, hint, error, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  const { t } = useI18n();
  return (
    <div className="field">
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error-text" role="alert">{t(error)}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ label, hint, error, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <input id={fid} className="input" aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

export function PasswordInput({ label, hint, error, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const { t } = useI18n();
  const auto = useId();
  const fid = id ?? auto;
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <div className="input-wrap">
        <input id={fid} className="input" type={shown ? "text" : "password"} aria-invalid={error ? true : undefined} {...rest} />
        <button type="button" className="reveal" onClick={() => setShown((s) => !s)} aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")} aria-pressed={shown} aria-controls={fid}>
          <Icon name={shown ? "eyeOff" : "eye"} />
        </button>
      </div>
    </Field>
  );
}

export function TextArea({ label, hint, error, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <textarea id={fid} className="textarea" aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, error, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <select id={fid} className="select" aria-invalid={error ? true : undefined} {...rest}>{children}</select>
    </Field>
  );
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  const { t } = useI18n();
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} />
        <span>{children}</span>
      </label>
      {error && <span className="error-text" role="alert">{t(error)}</span>}
    </div>
  );
}

/* ── status & small parts ── */
export function Status({ tone, children }: { tone: "ok" | "warn" | "bad" | "info" | "neutral"; children: ReactNode }) {
  return <span className={`status s-${tone}`}>{children}</span>;
}

export const MISSION_STATUS_TONE: Record<MissionStatus, "ok" | "warn" | "neutral" | "bad" | "info"> = { draft: "neutral", pending_review: "warn", published: "ok", closed: "info", cancelled: "bad" };

export const VERIFICATION_TONE: Record<VerificationStatus, "ok" | "warn" | "bad" | "info"> = { pending: "warn", approved: "ok", rejected: "bad", needs_more_info: "info" };

export function VerificationStatusTag({ status }: { status: VerificationStatus }) {
  const { t } = useI18n();
  return <Status tone={VERIFICATION_TONE[status]}>{t(`vs.${status}`)}</Status>;
}

export function CategoryTag({ category, withIcon }: { category: Category; withIcon?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`tag cat-${category}`}>
      {withIcon ? <Icon name={CATEGORY_ICON[category]} size={16} /> : <span className="cat-dot" aria-hidden />}
      {t(`cat.${category}`)}
    </span>
  );
}

export function DifficultyTag({ difficulty, showLabel = true }: { difficulty: Difficulty; showLabel?: boolean }) {
  const { t } = useI18n();
  const level = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  return (
    <span className="tag" title={t(`diff.${difficulty}`)}>
      <span className="diff" data-level={level} aria-hidden><i /><i /><i /></span>
      {showLabel && t(`diff.${difficulty}`)}
    </span>
  );
}

export function Coins({ value, size = 16, className }: { value: number | string; size?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cx("coins", className)} aria-label={`${value} ${t("coin.name")}`}>
      <span className="coin" style={{ "--size": `${size}px` } as CSSProperties} aria-hidden />
      <span>{value}</span>
    </span>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "·";
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {src && isPreset(src) ? <PresetArt id={src.slice(7)} /> : src && !src.startsWith("preset:") ? <img src={src} alt="" /> : initials}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Empty({ icon = "compass", title, body, action }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p className="t-h3" style={{ color: "var(--text)" }}>{title}</p>
      {body && <p className="t-small" style={{ maxWidth: 360 }}>{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, icon }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode; icon?: IconName }) {
  const def: Record<string, IconName> = { info: "info", warn: "alert", bad: "xCircle", ok: "checkCircle" };
  return (
    <div className={`notice n-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon ?? def[tone]} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Skeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="stack g8" aria-busy>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height }} />)}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} type="button" role="tab" className="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}>
          {i.label}
          {i.count ? <span className="t-meta">{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.value} type="button" aria-pressed={value === i.value} onClick={() => onChange(i.value)}>{i.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card pad stack g8">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="t-small muted">{sub}</span>}
    </div>
  );
}

/* ── dialog ── */
export function Dialog({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
    first?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx("dialog", wide && "dialog-wide")} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="row between g12" style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="t-h3">{title}</h2>
          <button type="button" data-close className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label={t("a.close")}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div className="row g8" style={{ justifyContent: "flex-end", padding: "12px 20px 16px" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── toasts ── */
type Toast = { id: number; text: string; tone: "info" | "error" };
const ToastCtx = createContext<(text: string, tone?: "info" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === "error" ? 6000 : 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="toast" data-tone={i.tone}>
            <Icon name={i.tone === "error" ? "alert" : "check"} />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Large number that tweens to its new value (used for balances that just changed). */
export function TweenNumber({ value, format = (n: number) => String(n) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); from.current = value; return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * e));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
