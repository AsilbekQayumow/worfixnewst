"use client";
import { useEffect, useRef } from "react";

const HUES = [356, 44, 140, 205, 320, 28];
interface Spark { x: number; y: number; vx: number; vy: number; life: number; hue: number; size: number }
interface Rocket { x: number; y: number; vy: number; ty: number; hue: number }

/**
 * v8: fireworks on a canvas that fills its parent. `rate` = bursts per second (0 stops launching; the sky clears).
 * Skipped for people who prefer less motion.
 */
export function Fireworks({ rate = 0.6, className }: { rate?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let w = 0, h = 0, raf = 0, last = performance.now(), acc = 0;
    const sparks: Spark[] = [];
    const rockets: Rocket[] = [];
    const size = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = w * dpr; cv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const burst = (x: number, y: number, hue: number) => {
      const n = 46 + Math.floor(Math.random() * 30);
      const ring = Math.random() < 0.35;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
        const sp = ring ? 2.6 : 0.6 + Math.random() * 2.6;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: hue + (Math.random() * 30 - 15), size: 1.2 + Math.random() * 1.4 });
      }
    };
    const tick = (now: number) => {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      acc += (rateRef.current * dt) / 60;
      if (acc >= 1 || (rateRef.current > 0 && Math.random() < rateRef.current * dt * 0.004)) {
        acc = 0;
        rockets.push({ x: w * (0.15 + Math.random() * 0.7), y: h + 4, vy: -(4.2 + Math.random() * 2.2) * (h / 320), ty: h * (0.15 + Math.random() * 0.35), hue: HUES[(Math.random() * HUES.length) | 0] });
      }
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        g.fillStyle = `hsla(${r.hue},100%,75%,0.9)`;
        g.fillRect(r.x - 1, r.y, 2, 6);
        if (r.y <= r.ty) { burst(r.x, r.y, r.hue); rockets.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985; s.vy = s.vy * 0.985 + 0.035 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= 0.012 * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        g.fillStyle = `hsla(${s.hue},100%,${55 + s.life * 25}%,${s.life})`;
        g.beginPath(); g.arc(s.x, s.y, s.size * (0.6 + s.life * 0.6), 0, Math.PI * 2); g.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv.parentElement!);
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <canvas ref={ref} className={className ?? "fireworks"} aria-hidden />;
}
