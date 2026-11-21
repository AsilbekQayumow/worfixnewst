"use client";
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(margin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: margin, threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

/** Reveals its children when scrolled into view. Children with `data-stagger` rise one after another. */
export function Reveal({ as: Tag = "div", className, style, children, delay = 0 }: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode; delay?: number }) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag ref={ref} className={`rv${className ? ` ${className}` : ""}`} data-in={inView || undefined} style={{ ...style, ["--d" as string]: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Counts up from 0 to `value` the first time it is seen. */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), duration = 1400 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReduced()) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setShown(value * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return <span ref={ref} className="num">{format(shown)}</span>;
}

/** Splits a line into words that rise in one after another. */
export function Words({ text, start = 0, step = 70 }: { text: string; start?: number; step?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={`${w}${i}`} className="word"><span style={{ animationDelay: `${start + i * step}ms` }}>{w}</span>{" "}</span>
      ))}
    </>
  );
}

/** Tilts its content a little toward the pointer (mouse and trackpad only). */
export function Tilt({ children, className, max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
        el.style.setProperty("--px", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--py", `${(y * 100).toFixed(1)}%`);
      });
    };
    const leave = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, [max]);
  return <div ref={ref} className={`tilt${className ? ` ${className}` : ""}`}>{children}</div>;
}
